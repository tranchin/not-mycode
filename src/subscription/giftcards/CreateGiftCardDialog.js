// @flow

import m from "mithril"
import stream from "mithril/stream/stream.js"
import {Dialog} from "../../gui/base/Dialog"
import {serviceRequest} from "../../api/main/Entity"
import {logins} from "../../api/main/LoginController"
import type {CustomerInfo} from "../../api/entities/sys/CustomerInfo"
import type {AccountingInfo} from "../../api/entities/sys/AccountingInfo"
import {worker} from "../../api/main/WorkerClient"
import {showProgressDialog} from "../../gui/base/ProgressDialog"
import {GiftCardTypeRef} from "../../api/entities/sys/GiftCard"
import {locator} from "../../api/main/MainLocator"
import type {Country} from "../../api/common/CountryList"
import {getByAbbreviation} from "../../api/common/CountryList"
import {SysService} from "../../api/entities/sys/Services"
import {HttpMethod} from "../../api/common/EntityFunctions"
import {GiftCardGetReturnTypeRef} from "../../api/entities/sys/GiftCardGetReturn"
import type {GiftCardOption} from "../../api/entities/sys/GiftCardOption"
import {HtmlEditor, Mode} from "../../gui/base/HtmlEditor"
import {DropDownSelector} from "../../gui/base/DropDownSelector"
import {createCountryDropdown} from "../../gui/base/GuiUtils"
import {BuyOptionBox} from "../BuyOptionBox"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {formatPrice} from "../SubscriptionUtils"
import {showGiftCardToShare} from "./GiftCardUtils"
import type {DialogHeaderBarAttrs} from "../../gui/base/DialogHeaderBar"
import {showUserError} from "../../misc/ErrorHandlerImpl"
import {UserError} from "../../api/common/error/UserError"
import {PaymentMethodType} from "../../api/common/TutanotaConstants"
import {lang} from "../../misc/LanguageViewModel"
import {NotAuthorizedError, PreconditionFailedError} from "../../api/common/error/RestError"

export type CreateGiftCardViewAttrs = {
	purchaseLimit: number,
	purchasePeriodMonths: number,
	availablePackages: Array<GiftCardOption>;
	selectedPackageIndex: number;
	message: string;
	country: ?Country;
	outerDialog: lazy<Dialog>
}

class GiftCardCreateView implements MComponent<CreateGiftCardViewAttrs> {

	messageEditor: HtmlEditor
	countrySelector: DropDownSelector<?Country>

	selectedPackage: Stream<number>
	selectedCountry: Stream<?Country>

	constructor(vnode: Vnode<CreateGiftCardViewAttrs>) {
		const a = vnode.attrs
		this.selectedPackage = stream(a.selectedPackageIndex)
		this.selectedCountry = stream(a.country)
		this.messageEditor = new HtmlEditor("yourMessage_label", {enabled: true})
			.setMinHeight(150)
			.setMode(Mode.WYSIWYG)
			.showBorders()
			.setValue(a.message)
			.setEnabled(true)

		this.countrySelector = createCountryDropdown(
			this.selectedCountry,
			() => lang.get("invoiceCountryInfoConsumer_msg"),
			"selectRecipientCountry_msg")
	}

	view(vnode: Vnode<CreateGiftCardViewAttrs>): Children {
		const a = vnode.attrs
		return [
			m(".flex.center-horizontally.wrap",
				a.availablePackages.map((option, index) =>
					m(BuyOptionBox, {
						heading: `Option ${index + 1}`, // TODO make nice headings
						actionButton: {
							view: () => m(ButtonN, {
								label: "pricing.select_action",
								click: () => {
									a.selectedPackageIndex = index
								},
								type: ButtonType.Login,
							})
						},
						price: formatPrice(parseFloat(option.value), true),
						originalPrice: formatPrice(parseFloat(option.value), true),
						helpLabel: "pricing.basePriceIncludesTaxes_msg",
						features: () => [],
						width: 230,
						height: 250,
						paymentInterval: null,
						highlighted: a.selectedPackageIndex === index,
						showReferenceDiscount: false,
					})
				)),
			m(this.messageEditor),
			m(this.countrySelector),
			m(".flex-center.pt-l",
				m(".flex-grow-shrink-auto.max-width-m.pt.pb.plr-l", m(ButtonN, {
						label: "buy_action",
						click: () => {

							const value = a.availablePackages[this.selectedPackage()].value
							const message = this.messageEditor.getValue()
							const country = this.selectedCountry()

							if (!country) {
								Dialog.error("selectRecipientCountry_msg")
								return
							}

							const confirmed = Dialog.confirm("paymentDataValidation_action",)

							showProgressDialog("loading_msg",
								worker.generateGiftCard(message, value, country.a)
								      .then(createdGiftCardId => locator.entityClient.load(GiftCardTypeRef, createdGiftCardId)))
								.then(giftCard => {
									a.outerDialog().close()
									showGiftCardToShare(giftCard)
								})
								.catch(PreconditionFailedError, e => {
									switch (e.data) {
										case "giftcard.limitreached":
											throw new UserError(() => lang.get("tooManyGiftCards_msg", {
												"{amount}": `${a.purchaseLimit}`,
												"{period}": `${a.purchasePeriodMonths} months`
											}))
										case "giftcard.noaccountinginfo":
											throw new UserError("providePaymentDetails_msg")
										case "giftcard.invalidpaymentmethod":
											throw new UserError("invalidGiftCardPaymentMethod_msg")
										default:
											throw e // If this happens then the server changed and we need to handle it
									}
								})
								.catch(NotAuthorizedError, e => {
									throw new UserError("giftCardPurchaseFailed_msg")
								})
								.catch(UserError, showUserError)
						},
						type: ButtonType.Login,
					})
				)
			)
		]
	}
}

/**
 * Create a dialog to buy a giftcard or show error if the user cannot do so
 * @returns {Promise<unknown>|Promise<void>|Promise<Promise<void>>}
 */
export function showPurchaseGiftCardDialog(): Promise<void> {
	let customerInfo: CustomerInfo
	const loadDialogPromise =
		logins.getUserController()
		      .loadAccountingInfo()
		      .then(accountingInfo => {
			      // Only allow purchase with supported payment methods
			      if (!accountingInfo || accountingInfo.paymentMethod === PaymentMethodType.Invoice || accountingInfo.paymentMethod
				      === PaymentMethodType.AccountBalance) {
				      throw new UserError("invalidGiftCardPaymentMethod_msg")
			      }
		      })
		      .then(() => Promise.all([
			      serviceRequest(SysService.GiftCardService, HttpMethod.GET, null, GiftCardGetReturnTypeRef),
			      logins.getUserController().loadCustomerInfo()
		      ]))
		      .spread((giftCardInfo, customerInfo) => {
			      // User can't buy too many gift cards so we have to load their giftcards in order to check how many they ordered
			      const loadGiftCardsPromise = customerInfo.giftCards
				      ? locator.entityClient.loadAll(GiftCardTypeRef, customerInfo.giftCards.items)
				      : Promise.resolve([])

			      return loadGiftCardsPromise.then(existingGiftCards => {

				      const sixMonthsAgo = new Date()
				      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - parseInt(giftCardInfo.period))
				      const numPurchasedGiftCards = existingGiftCards.filter(giftCard => giftCard.orderDate > sixMonthsAgo).length

				      if (numPurchasedGiftCards >= parseInt(giftCardInfo.maxPerPeriod)) {
					      throw new UserError(() => lang.get("tooManyGiftCards_msg", {
						      amount: giftCardInfo.maxPerPeriod,
						      period: `${giftCardInfo.period} months`
					      }))
				      }

				      return logins.getUserController().loadAccountingInfo().then((accountingInfo: AccountingInfo) => {
					      let dialog

					      const attrs: CreateGiftCardViewAttrs = {
						      purchaseLimit: giftCardInfo.maxPerPeriod,
						      purchasePeriodMonths: giftCardInfo.period,
						      availablePackages: giftCardInfo.options,
						      selectedPackageIndex: Math.floor(giftCardInfo.options.length / 2),
						      message: lang.get("defaultGiftCardMessage_msg"),
						      country: accountingInfo.invoiceCountry
							      ? getByAbbreviation(accountingInfo.invoiceCountry)
							      : null,
						      outerDialog: () => dialog
					      };

					      const headerBarAttrs: DialogHeaderBarAttrs = {
						      left: [
							      {
								      label: "close_alt",
								      type: ButtonType.Secondary,
								      click: () => dialog.close()
							      }
						      ]
					      }
					      dialog = Dialog.largeDialogN(headerBarAttrs, GiftCardCreateView, attrs)
					      return dialog
				      })
			      })
		      })

	return showProgressDialog("loading_msg", loadDialogPromise)
		.then(dialog => dialog && dialog.show())
		.catch(UserError, showUserError)
}