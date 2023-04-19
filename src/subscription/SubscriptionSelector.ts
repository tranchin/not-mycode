import m, { Children, Component, Vnode } from "mithril"
import type { TranslationKey } from "../misc/LanguageViewModel"
import { lang } from "../misc/LanguageViewModel"
import type { BuyOptionBoxAttr } from "./BuyOptionBox"
import { BOX_MARGIN, BuyOptionBox, getActiveSubscriptionActionButtonReplacement } from "./BuyOptionBox"
import type { SegmentControlItem } from "../gui/base/SegmentControl"
import { SegmentControl } from "../gui/base/SegmentControl"
import { formatMonthlyPrice, PaymentInterval, PriceAndConfigProvider } from "./PriceUtils"
import {
	FeatureCategory,
	FeatureListItem,
	FeatureListProvider,
	getDisplayNameOfSubscriptionType,
	ReplacementKey,
	SelectedSubscriptionOptions,
	UpgradePriceType,
} from "./FeatureListProvider"
import { ProgrammingError } from "../api/common/error/ProgrammingError"
import { ButtonAttrs } from "../gui/base/Button.js"
import { assertNotNull, downcast, lazy, neverNull } from "@tutao/tutanota-utils"
import { AvailableSubscriptionType, SubscriptionName, SubscriptionType } from "../api/common/TutanotaConstants.js"

const BusinessUseItems: SegmentControlItem<boolean>[] = [
	{
		name: lang.get("pricing.privateUse_label"),
		value: false,
	},
	{
		name: lang.get("pricing.businessUse_label"),
		value: true,
	},
]

export type SubscriptionActionButtons = Record<AvailableSubscriptionType, lazy<ButtonAttrs>>

export type SubscriptionSelectorAttr = {
	options: SelectedSubscriptionOptions
	campaignInfoTextId: TranslationKey | null
	actionButtons: SubscriptionActionButtons
	boxWidth: number
	boxHeight: number
	highlightPremium?: boolean
	currentSubscriptionType: SubscriptionType | null
	currentlySharingOrdered: boolean
	currentlyBusinessOrdered: boolean
	currentlyWhitelabelOrdered: boolean
	orderedContactForms: number
	isInitialUpgrade: boolean
	featureListProvider: FeatureListProvider
	priceAndConfigProvider: PriceAndConfigProvider
	referralCodeMsg: TranslationKey | null
}

export function getActionButtonBySubscription(actionButtons: SubscriptionActionButtons, subscription: AvailableSubscriptionType): lazy<ButtonAttrs> {
	const ret = actionButtons[subscription]
	if (ret == null) {
		throw new ProgrammingError("Plan is not valid")
	}
	return ret
}

type ExpanderTargets =
	| SubscriptionType.Free
	| SubscriptionType.Revolutionary
	| SubscriptionType.Legend
	| SubscriptionType.Essential
	| SubscriptionType.Advanced
	| SubscriptionType.Unlimited
	| "All"

export class SubscriptionSelector implements Component<SubscriptionSelectorAttr> {
	private containerDOM: Element | null = null
	private featuresExpanded: { [K in ExpanderTargets]: boolean } = {
		[SubscriptionType.Free]: false,
		[SubscriptionType.Revolutionary]: false,
		[SubscriptionType.Legend]: false,
		[SubscriptionType.Essential]: false,
		[SubscriptionType.Advanced]: false,
		[SubscriptionType.Unlimited]: false,
		All: false,
	}

	view(vnode: Vnode<SubscriptionSelectorAttr>): Children {
		let buyBoxesViewPlacement
		// Add BuyOptionBox margin twice to the boxWidth received
		const columnWidth = vnode.attrs.boxWidth + BOX_MARGIN * 2
		const inMobileView: boolean = (this.containerDOM && this.containerDOM.clientWidth < columnWidth * 2) == true
		const featureExpander = this.renderFeatureExpanders(inMobileView, vnode.attrs.featureListProvider) // renders all feature expanders, both for every single subscription option but also for the whole list
		let additionalInfo: Children

		if (vnode.attrs.options.businessUse()) {
			buyBoxesViewPlacement = [
				m("", [
					m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Essential, true, inMobileView)),
					featureExpander[SubscriptionType.Essential],
				]),
				m("", [
					m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Advanced, inMobileView, inMobileView)),
					featureExpander[SubscriptionType.Advanced],
				]),
				m("", [
					m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Unlimited, inMobileView, inMobileView)),
					featureExpander[SubscriptionType.Unlimited],
				]),
			]
			additionalInfo = m(".flex.flex-column.items-center", [
				featureExpander.All, // global feature expander
				m(".smaller.mb.center", lang.get("pricing.downgradeToPrivateNotAllowed_msg")), //only displayed when business options are shown)
				m(".smaller.mb.center", lang.get("pricing.subscriptionPeriodInfoBusiness_msg")),
			])
		} else {
			const currentSubscription = vnode.attrs.currentSubscriptionType
			const revolutionaryBuyBox = m("", [
				m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Revolutionary, inMobileView, inMobileView)),
				featureExpander[SubscriptionType.Revolutionary],
			])
			const legendBuyOptionBox = m("", [
				m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Legend, inMobileView, inMobileView)),
				featureExpander[SubscriptionType.Essential],
			])

			const freeBuyOptionBox = m("", [m(BuyOptionBox, this.createBuyOptionBoxAttr(vnode.attrs, SubscriptionType.Free, true, inMobileView)), featureExpander[SubscriptionType.Free]])

			// Changes order of BuyBoxes to Premium Pro Free, needed for mobile view (one column layout)
			if (inMobileView) {
				buyBoxesViewPlacement = [revolutionaryBuyBox, legendBuyOptionBox, freeBuyOptionBox]
			} else {
				buyBoxesViewPlacement = [freeBuyOptionBox, revolutionaryBuyBox, legendBuyOptionBox]
			}
			additionalInfo = m(".flex.flex-column.items-center", [
				featureExpander.All, // global feature expander
				m(".smaller.mb.center", lang.get("pricing.subscriptionPeriodInfoPrivate_msg")),
			])
		}

		const currentPlanInfo = this.getCurrentPlanInfo(vnode.attrs)

		return [
			vnode.attrs.isInitialUpgrade
				? m(SegmentControl, {
						selectedValue: vnode.attrs.options.businessUse(),
						onValueSelected: vnode.attrs.options.businessUse,
						items: BusinessUseItems,
				  })
				: null,
			vnode.attrs.campaignInfoTextId && lang.exists(vnode.attrs.campaignInfoTextId) ? m(".b.center.mt", lang.get(vnode.attrs.campaignInfoTextId)) : null,
			vnode.attrs.referralCodeMsg ? m(".b.center.mt", lang.get(vnode.attrs.referralCodeMsg)) : null,
			currentPlanInfo ? m(".smaller.center.mt", currentPlanInfo) : null,
			m(
				".flex.center-horizontally.wrap",
				{
					oncreate: (vnode) => {
						this.containerDOM = vnode.dom as HTMLElement
						m.redraw()
					},
				},
				buyBoxesViewPlacement,
				additionalInfo,
			),
		]
	}

	private getCurrentPlanInfo(selectorAttrs: SubscriptionSelectorAttr): string | null {
		if (selectorAttrs.options.businessUse() && selectorAttrs.currentSubscriptionType && !selectorAttrs.currentlyBusinessOrdered) {
			const { priceAndConfigProvider, options, currentSubscriptionType } = selectorAttrs
			const price = priceAndConfigProvider.getSubscriptionPrice(options.paymentInterval(), assertNotNull(currentSubscriptionType), UpgradePriceType.PlanActualPrice)
			return (
				lang.get("businessCustomerNeedsBusinessFeaturePlan_msg", {
					"{price}": formatMonthlyPrice(price, selectorAttrs.options.paymentInterval()),
					"{plan}": selectorAttrs.currentSubscriptionType,
				}) +
				" " +
				lang.get("businessCustomerAutoBusinessFeature_msg")
			)
		}

		return null
	}

	private createBuyOptionBoxAttr(
		selectorAttrs: SubscriptionSelectorAttr,
		targetSubscription: AvailableSubscriptionType,
		renderCategoryTitle: boolean,
		mobile: boolean,
	): BuyOptionBoxAttr {
		const { featureListProvider, priceAndConfigProvider } = selectorAttrs
		const subscriptionFeatures = featureListProvider.getFeatureList(targetSubscription)
		const categoriesToShow = subscriptionFeatures.categories
			.map((fc) => {
				return localizeFeatureCategory(fc, targetSubscription, selectorAttrs)
			})
			.filter((fc): fc is BuyOptionBoxAttr["categories"][0] => fc != null)

		// we only highlight the private Premium box if this is a signup or the current subscription type is Free
		selectorAttrs.highlightPremium =
			targetSubscription === SubscriptionType.Revolutionary && !selectorAttrs.options.businessUse() && !selectorAttrs.currentSubscriptionType
		const subscriptionPrice = priceAndConfigProvider.getSubscriptionPrice(
			selectorAttrs.options.paymentInterval(),
			targetSubscription,
			UpgradePriceType.PlanActualPrice,
		)
		return {
			heading: getDisplayNameOfSubscriptionType(targetSubscription),
			actionButton:
				selectorAttrs.currentSubscriptionType === targetSubscription
					? getActiveSubscriptionActionButtonReplacement()
					: getActionButtonBySubscription(selectorAttrs.actionButtons, targetSubscription),
			price: formatMonthlyPrice(subscriptionPrice, selectorAttrs.options.paymentInterval()),
			priceHint: getPriceHint(subscriptionPrice, selectorAttrs.options.paymentInterval()),
			helpLabel: getHelpLabel(targetSubscription, selectorAttrs.options.businessUse()),
			categories: categoriesToShow,
			featuresExpanded: this.featuresExpanded[targetSubscription] || this.featuresExpanded.All,
			width: selectorAttrs.boxWidth,
			height: selectorAttrs.boxHeight,
			paymentInterval: selectorAttrs.isInitialUpgrade && targetSubscription !== SubscriptionType.Free ? selectorAttrs.options.paymentInterval : null,
			highlighted: selectorAttrs.highlightPremium,
			showReferenceDiscount: selectorAttrs.isInitialUpgrade,
			renderCategoryTitle,
			mobile,
		}
	}

	/**
	 * Renders the feature expanders depending on whether currently displaying the feature list in single-column layout or in multi-column layout.
	 * If a specific expander is not needed and thus should not be renderer, null | undefined is returned
	 */
	private renderFeatureExpanders(inMobileView: boolean | null, featureListProvider: FeatureListProvider): Record<ExpanderTargets, Children> {
		if (!featureListProvider.featureLoadingDone()) {
			// the feature list is not available
			return {
				[SubscriptionType.Free]: null,
				[SubscriptionType.Revolutionary]: null,
				[SubscriptionType.Legend]: null,
				[SubscriptionType.Essential]: null,
				[SubscriptionType.Advanced]: null,
				[SubscriptionType.Unlimited]: null,
				All: null,
			}
		}
		if (inMobileView) {
			// In single-column layout every subscription type has its own feature expander.
			if (this.featuresExpanded.All) {
				for (const k in this.featuresExpanded) {
					this.featuresExpanded[k as ExpanderTargets] = true
				}
			}
			return {
				[SubscriptionType.Free]: this.renderExpander(SubscriptionType.Free),
				[SubscriptionType.Revolutionary]: this.renderExpander(SubscriptionType.Revolutionary),
				[SubscriptionType.Legend]: this.renderExpander(SubscriptionType.Legend),
				[SubscriptionType.Advanced]: this.renderExpander(SubscriptionType.Advanced),
				[SubscriptionType.Essential]: this.renderExpander(SubscriptionType.Essential),
				[SubscriptionType.Unlimited]: this.renderExpander(SubscriptionType.Unlimited),
				All: null,
			}
		} else {
			for (const k in this.featuresExpanded) {
				this.featuresExpanded[k as ExpanderTargets] = this.featuresExpanded.All // in multi-column layout the specific feature expanders should follow the global one
			}
			return Object.assign({} as Record<ExpanderTargets, Children>, { All: this.renderExpander("All") })
		}
	}

	/**
	 * Renders a single feature expander.
	 * @param subType The current expander that should be rendered
	 * @private
	 */
	private renderExpander(subType: ExpanderTargets): Children {
		return this.featuresExpanded[subType]
			? null
			: m(
					".mb-l.content-hover.button.cursor-pointer.text-fade.center",
					{
						role: "button",
						onclick: (e: Event) => {
							this.featuresExpanded[subType] = !this.featuresExpanded[subType]
							e.preventDefault()
						},
					},
					lang.get("pricing.showAllFeatures"),
			  )
	}
}

function localizeFeatureListItem(
	item: FeatureListItem,
	targetSubscription: SubscriptionType,
	attrs: SubscriptionSelectorAttr,
): BuyOptionBoxAttr["categories"][0]["features"][0] | null {
	let text = tryGetTranslation(item.text, getReplacement(item.replacements, targetSubscription, attrs))
	if (text == null) {
		return null
	}
	if (!item.toolTip) {
		return { text, key: item.text, antiFeature: item.antiFeature, omit: item.omit, heart: item.heart ? true : false }
	} else {
		const toolTipText = tryGetTranslation(item.toolTip)
		if (toolTipText === null) {
			return null
		}
		const toolTip = item.toolTip.endsWith("_markdown") ? m.trust(toolTipText) : toolTipText
		return { text, toolTip, key: item.text, antiFeature: item.antiFeature, omit: item.omit, heart: item.heart ? true : false }
	}
}

function localizeFeatureCategory(
	category: FeatureCategory,
	targetSubscription: SubscriptionType,
	attrs: SubscriptionSelectorAttr,
): BuyOptionBoxAttr["categories"][0] | null {
	const title = tryGetTranslation(category.title)
	const features = downcast<{ text: string; toolTip?: m.Child; key: string; antiFeature?: boolean | undefined; omit: boolean; heart: boolean }[]>(
		category.features.map((f) => localizeFeatureListItem(f, targetSubscription, attrs)).filter((it) => it != null),
	)
	return { title, key: category.title, features, featureCount: category.featureCount }
}

function tryGetTranslation(key: TranslationKey, replacements?: Record<string, string | number>): string | null {
	try {
		return lang.get(key, replacements)
	} catch (e) {
		console.log("could not translate feature text for key", key, "hiding feature item")
		return null
	}
}

/**
 * get a string to insert into a translation with a slot.
 * if no key is found, undefined is returned and nothing is replaced.
 */
export function getReplacement(
	key: ReplacementKey | undefined,
	subscription: SubscriptionType,
	attrs: SubscriptionSelectorAttr,
): Record<string, string | number> | undefined {
	const { priceAndConfigProvider, options } = attrs
	switch (key) {
		case "mailAddressAliases":
			return { "{amount}": priceAndConfigProvider.getSubscriptionConfig(subscription).nbrOfAliases }
		case "storage":
			return { "{amount}": priceAndConfigProvider.getSubscriptionConfig(subscription).storageGb }
		case "contactForm":
			const subscriptionPriceContact = priceAndConfigProvider.getSubscriptionPrice(
				options.paymentInterval(),
				subscription,
				UpgradePriceType.ContactFormPrice,
			)
			return { "{price}": formatMonthlyPrice(subscriptionPriceContact, attrs.options.paymentInterval()) }
	}
}

function getHelpLabel(subscriptionType: SubscriptionType, businessUse: boolean): TranslationKey {
	if (subscriptionType === SubscriptionType.Free) return "pricing.upgradeLater_msg"
	return businessUse ? "pricing.basePriceExcludesTaxes_msg" : "pricing.basePriceIncludesTaxes_msg"
}

function getPriceHint(subscriptionPrice: number, paymentInterval: PaymentInterval): TranslationKey {
	if (subscriptionPrice > 0) {
		return paymentInterval === PaymentInterval.Yearly ? "pricing.perMonthPaidYearly_label" : "pricing.perMonth_label"
	} else {
		return "emptyString_msg"
	}
}
