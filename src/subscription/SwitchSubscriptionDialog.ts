import m from "mithril"
import { Dialog } from "../gui/base/Dialog"
import { lang } from "../misc/LanguageViewModel"
import { ButtonAttrs, ButtonType } from "../gui/base/Button.js"
import type { AccountingInfo, Booking, Customer, CustomerInfo, PlanPrices, SwitchAccountTypePostIn } from "../api/entities/sys/TypeRefs.js"
import { createSwitchAccountTypePostIn } from "../api/entities/sys/TypeRefs.js"
import { AccountType, BookingItemFeatureByCode, BookingItemFeatureType, Const, Keys, PlanType, UnsubscribeFailureReason } from "../api/common/TutanotaConstants"
import { SubscriptionActionButtons, SubscriptionSelector } from "./SubscriptionSelector"
import stream from "mithril/stream"
import { showProgressDialog } from "../gui/dialogs/ProgressDialog"
import { buyAliases, buyBusiness, buySharing, buyStorage, buyWhitelabel } from "./SubscriptionUtils"
import type { DialogHeaderBarAttrs } from "../gui/base/DialogHeaderBar"
import type { CurrentSubscriptionInfo } from "./SwitchSubscriptionDialogModel"
import {
	isDowngradeAliasesNeeded,
	isDowngradeBusinessNeeded,
	isDowngradeSharingNeeded,
	isDowngradeStorageNeeded,
	isDowngradeWhitelabelNeeded,
	SwitchSubscriptionDialogModel,
} from "./SwitchSubscriptionDialogModel"
import { locator } from "../api/main/MainLocator"
import { SwitchAccountTypeService } from "../api/entities/sys/Services.js"
import { BadRequestError, InvalidDataError, PreconditionFailedError } from "../api/common/error/RestError.js"
import { FeatureListProvider, getDisplayNameOfPlanType } from "./FeatureListProvider"
import { isSubscriptionDowngrade, PriceAndConfigProvider } from "./PriceUtils"
import { defer, DeferredObject, lazy } from "@tutao/tutanota-utils"

/**
 * Only shown if the user is already a Premium user. Allows cancelling the subscription (only private use) and switching the subscription to a different paid subscription.
 */
export async function showSwitchDialog(
	customer: Customer,
	customerInfo: CustomerInfo,
	accountingInfo: AccountingInfo,
	lastBooking: Booking,
): Promise<PlanType> {
	const deferred = defer<PlanType>()
	const [featureListProvider, priceAndConfigProvider] = await showProgressDialog(
		"pleaseWait_msg",
		Promise.all([FeatureListProvider.getInitializedInstance(), PriceAndConfigProvider.getInitializedInstance(null)]),
	)
	const model = new SwitchSubscriptionDialogModel(
		locator.bookingFacade,
		customer,
		customerInfo,
		accountingInfo,
		lastBooking,
		await locator.logins.getUserController().getPlanType(),
	)
	const cancelAction = () => {
		dialog.close()
		deferred.resolve(customerInfo.plan as PlanType)
	}

	const headerBarAttrs: DialogHeaderBarAttrs = {
		left: [
			{
				label: "cancel_action",
				click: cancelAction,
				type: ButtonType.Secondary,
			},
		],
		right: [],
		middle: () => lang.get("subscription_label"),
	}
	const currentSubscriptionInfo = model.currentSubscriptionInfo
	const dialog: Dialog = Dialog.largeDialog(headerBarAttrs, {
		view: () =>
			m(
				"#upgrade-account-dialog.pt",
				m(SubscriptionSelector, {
					// paymentInterval will not be updated as isInitialUpgrade is false
					options: {
						businessUse: stream(currentSubscriptionInfo.businessUse),
						paymentInterval: stream(currentSubscriptionInfo.paymentInterval),
					},
					campaignInfoTextId: null,
					referralCodeMsg: null,
					boxWidth: 230,
					boxHeight: 270,
					currentPlanType: currentSubscriptionInfo.planType,
					currentlySharingOrdered: currentSubscriptionInfo.currentlySharingOrdered,
					currentlyBusinessOrdered: currentSubscriptionInfo.currentlyBusinessOrdered,
					currentlyWhitelabelOrdered: currentSubscriptionInfo.currentlyWhitelabelOrdered,
					orderedContactForms: currentSubscriptionInfo.orderedContactForms,
					isInitialUpgrade: false,
					actionButtons: subscriptionActionButtons,
					featureListProvider: featureListProvider,
					priceAndConfigProvider,
				}),
			),
	})
		.addShortcut({
			key: Keys.ESC,
			exec: cancelAction,
			help: "close_alt",
		})
		.setCloseHandler(cancelAction)
	const subscriptionActionButtons: SubscriptionActionButtons = {
		[PlanType.Free]: () =>
			({
				label: "pricing.select_action",
				click: () => cancelSubscription(dialog, currentSubscriptionInfo, deferred),
				type: ButtonType.Login,
			} as ButtonAttrs),

		[PlanType.Revolutionary]: createSubscriptionPlanButton(dialog, PlanType.Revolutionary, currentSubscriptionInfo, deferred),
		[PlanType.Legend]: createSubscriptionPlanButton(dialog, PlanType.Legend, currentSubscriptionInfo, deferred),
		[PlanType.Essential]: createSubscriptionPlanButton(dialog, PlanType.Essential, currentSubscriptionInfo, deferred),
		[PlanType.Advanced]: createSubscriptionPlanButton(dialog, PlanType.Advanced, currentSubscriptionInfo, deferred),
		[PlanType.Unlimited]: createSubscriptionPlanButton(dialog, PlanType.Unlimited, currentSubscriptionInfo, deferred),
	}
	dialog.show()
	return deferred.promise
}

function createSubscriptionPlanButton(
	dialog: Dialog,
	targetSubscription: PlanType,
	currentSubscriptionInfo: CurrentSubscriptionInfo,
	deferredPlan: DeferredObject<PlanType>,
): lazy<ButtonAttrs> {
	return () => ({
		label: "pricing.select_action",
		click: () => {
			showProgressDialog(
				"pleaseWait_msg",
				switchSubscription(targetSubscription, dialog, currentSubscriptionInfo).then((newPlan) => deferredPlan.resolve(newPlan)),
			)
		},
		type: ButtonType.Login,
	})
}

function handleSwitchAccountPreconditionFailed(e: PreconditionFailedError): Promise<void> {
	const reason = e.data

	if (reason == null) {
		return Dialog.message("unknownError_msg")
	} else {
		let detailMsg: string

		switch (reason) {
			case UnsubscribeFailureReason.TOO_MANY_ENABLED_USERS:
				detailMsg = lang.get("accountSwitchTooManyActiveUsers_msg")
				break

			case UnsubscribeFailureReason.CUSTOM_MAIL_ADDRESS:
				detailMsg = lang.get("accountSwitchCustomMailAddress_msg")
				break

			case UnsubscribeFailureReason.TOO_MANY_CALENDARS:
				detailMsg = lang.get("accountSwitchMultipleCalendars_msg")
				break

			case UnsubscribeFailureReason.CALENDAR_TYPE:
				detailMsg = lang.get("accountSwitchSharedCalendar_msg")
				break

			case UnsubscribeFailureReason.TOO_MANY_ALIASES:
				detailMsg = lang.get("accountSwitchAliases_msg")
				break

			default:
				if (reason.startsWith(UnsubscribeFailureReason.FEATURE)) {
					const feature = reason.slice(UnsubscribeFailureReason.FEATURE.length + 1)
					const featureName = BookingItemFeatureByCode[feature as BookingItemFeatureType]
					detailMsg = lang.get("accountSwitchFeature_msg", {
						"{featureName}": featureName,
					})
				} else {
					detailMsg = lang.get("unknownError_msg")
				}

				break
		}

		return Dialog.message(() =>
			lang.get("accountSwitchNotPossible_msg", {
				"{detailMsg}": detailMsg,
			}),
		)
	}
}

async function tryDowngradePremiumToFree(switchAccountTypeData: SwitchAccountTypePostIn, currentSubscriptionInfo: CurrentSubscriptionInfo): Promise<PlanType> {
	const failed = await cancelAllAdditionalFeatures(PlanType.Free, currentSubscriptionInfo)
	if (failed) {
		return currentSubscriptionInfo.planType
	}

	try {
		await locator.serviceExecutor.post(SwitchAccountTypeService, switchAccountTypeData)
		await locator.customerFacade.switchPremiumToFreeGroup()
		return PlanType.Free
	} catch (e) {
		if (e instanceof PreconditionFailedError) {
			await handleSwitchAccountPreconditionFailed(e)
		} else if (e instanceof InvalidDataError) {
			await Dialog.message("accountSwitchTooManyActiveUsers_msg")
		} else if (e instanceof BadRequestError) {
			await Dialog.message("deactivatePremiumWithCustomDomainError_msg")
		} else {
			throw e
		}
		return currentSubscriptionInfo.planType
	}
}

async function cancelSubscription(dialog: Dialog, currentSubscriptionInfo: CurrentSubscriptionInfo, planPromise: DeferredObject<PlanType>): Promise<void> {
	if (!(await Dialog.confirm("unsubscribeConfirm_msg"))) {
		return
	}
	const switchAccountTypeData = createSwitchAccountTypePostIn()
	switchAccountTypeData.accountType = AccountType.FREE
	switchAccountTypeData.date = Const.CURRENT_DATE
	try {
		await showProgressDialog(
			"pleaseWait_msg",
			tryDowngradePremiumToFree(switchAccountTypeData, currentSubscriptionInfo).then((newPlan) => planPromise.resolve(newPlan)),
		)
	} finally {
		dialog.close()
	}
}

async function getUpOrDowngradeMessage(targetSubscription: PlanType, currentSubscriptionInfo: CurrentSubscriptionInfo): Promise<string> {
	const priceAndConfigProvider = await PriceAndConfigProvider.getInitializedInstance(null)
	// we can only switch from a non-business plan to a business plan and not vice verse
	// a business customer may not have booked the business feature and be forced to book it even if downgrading: e.g. Teams -> PremiumBusiness
	// switch to free is not allowed here.
	let msg = ""

	if (isSubscriptionDowngrade(targetSubscription, currentSubscriptionInfo.planType)) {
		msg = lang.get(
			targetSubscription === PlanType.Revolutionary || targetSubscription === PlanType.Essential ? "downgradeToPremium_msg" : "downgradeToTeams_msg",
		)

		if (targetSubscription === PlanType.Essential || targetSubscription === PlanType.Advanced) {
			msg = msg + " " + lang.get("businessIncluded_msg")
		}
	} else {
		const planDisplayName = getDisplayNameOfPlanType(targetSubscription)
		msg = lang.get("upgradePlan_msg", {
			"{plan}": planDisplayName,
		})

		if (targetSubscription === PlanType.Essential || targetSubscription === PlanType.Advanced || targetSubscription === PlanType.Unlimited) {
			msg += " " + lang.get("businessIncluded_msg")
		}
		const planPrices = priceAndConfigProvider.getPlanPrices(targetSubscription)
		if (
			isDowngradeAliasesNeeded(planPrices, currentSubscriptionInfo.currentTotalAliases, currentSubscriptionInfo.includedAliases) ||
			isDowngradeStorageNeeded(planPrices, currentSubscriptionInfo.currentTotalAliases, currentSubscriptionInfo.includedStorage)
		) {
			msg = msg + "\n\n" + lang.get("upgradeProNoReduction_msg")
		}
	}

	return msg
}

async function switchSubscription(targetSubscription: PlanType, dialog: Dialog, currentSubscriptionInfo: CurrentSubscriptionInfo): Promise<PlanType> {
	if (targetSubscription === currentSubscriptionInfo.planType) {
		return currentSubscriptionInfo.planType
	}

	const message = await getUpOrDowngradeMessage(targetSubscription, currentSubscriptionInfo)
	const ok = await Dialog.confirm(() => message)
	if (!ok) {
		return currentSubscriptionInfo.planType
	}
	try {
		const postIn = createSwitchAccountTypePostIn()
		postIn.accountType = AccountType.PREMIUM
		postIn.plan = targetSubscription
		postIn.date = Const.CURRENT_DATE
		postIn.referralCode = null

		try {
			await showProgressDialog("pleaseWait_msg", locator.serviceExecutor.post(SwitchAccountTypeService, postIn))
			return targetSubscription
		} catch (e) {
			if (e instanceof PreconditionFailedError) {
				await handleSwitchAccountPreconditionFailed(e)
				return currentSubscriptionInfo.planType
			}
			throw e
		}
	} finally {
		dialog.close()
	}
}

/**
 * @returns True if any of the additional features could not be canceled, false otherwise
 */
async function cancelAllAdditionalFeatures(targetSubscription: PlanType, currentSubscriptionInfo: CurrentSubscriptionInfo): Promise<boolean> {
	let failed = false
	let targetPlanPrices: PlanPrices
	try {
		targetPlanPrices = (await PriceAndConfigProvider.getInitializedInstance(null)).getPlanPrices(targetSubscription)
	} catch (e) {
		console.log("failed to get subscription configs:", e)
		return true
	}
	if (isDowngradeAliasesNeeded(targetPlanPrices, currentSubscriptionInfo.currentTotalAliases, currentSubscriptionInfo.includedAliases)) {
		failed = await buyAliases(Number(targetPlanPrices.includedAliases))
	}
	if (isDowngradeStorageNeeded(targetPlanPrices, currentSubscriptionInfo.currentTotalStorage, currentSubscriptionInfo.includedStorage)) {
		failed = failed || (await buyStorage(Number(targetPlanPrices.includedStorage)))
	}
	if (isDowngradeSharingNeeded(targetPlanPrices, currentSubscriptionInfo.currentlySharingOrdered)) {
		failed = failed || (await buySharing(false))
	}
	if (isDowngradeBusinessNeeded(targetPlanPrices, currentSubscriptionInfo.currentlyBusinessOrdered)) {
		failed = failed || (await buyBusiness(false))
	}
	if (isDowngradeWhitelabelNeeded(targetPlanPrices, currentSubscriptionInfo.currentlyWhitelabelOrdered)) {
		failed = failed || (await buyWhitelabel(false))
	}
	return failed
}
