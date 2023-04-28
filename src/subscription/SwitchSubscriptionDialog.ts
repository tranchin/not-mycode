import m from "mithril"
import { Dialog } from "../gui/base/Dialog"
import { lang } from "../misc/LanguageViewModel"
import { ButtonAttrs, ButtonType } from "../gui/base/Button.js"
import type { AccountingInfo, Booking, Customer, CustomerInfo, SwitchAccountTypePostIn } from "../api/entities/sys/TypeRefs.js"
import { createSwitchAccountTypePostIn } from "../api/entities/sys/TypeRefs.js"
import { AccountType, Const, InvoiceData, Keys, NewBusinessPlans, PlanType, UnsubscribeFailureReason } from "../api/common/TutanotaConstants"
import { SubscriptionActionButtons, SubscriptionSelector } from "./SubscriptionSelector"
import stream from "mithril/stream"
import { showProgressDialog } from "../gui/dialogs/ProgressDialog"
import { BookingFailureReason } from "./SubscriptionUtils"
import type { DialogHeaderBarAttrs } from "../gui/base/DialogHeaderBar"
import type { CurrentSubscriptionInfo } from "./SwitchSubscriptionDialogModel"
import { SwitchSubscriptionDialogModel } from "./SwitchSubscriptionDialogModel"
import { locator } from "../api/main/MainLocator"
import { SwitchAccountTypeService } from "../api/entities/sys/Services.js"
import { BadRequestError, InvalidDataError, PreconditionFailedError } from "../api/common/error/RestError.js"
import { FeatureListProvider } from "./FeatureListProvider"
import { PriceAndConfigProvider } from "./PriceUtils"
import { defer, DeferredObject, lazy } from "@tutao/tutanota-utils"
import { showSwitchToBusinessInvoiceDataDialog } from "./SwitchToBusinessInvoiceDataDialog.js"
import { formatNameAndAddress } from "../misc/Formatter.js"
import { getByAbbreviation } from "../api/common/CountryList.js"

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
	const businessUse = stream(currentSubscriptionInfo.businessUse)
	const dialog: Dialog = Dialog.largeDialog(headerBarAttrs, {
		view: () =>
			m(
				"#upgrade-account-dialog.pt",
				m(SubscriptionSelector, {
					// paymentInterval will not be updated as isInitialUpgrade is false
					options: {
						businessUse,
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
			case BookingFailureReason.TOO_MANY_ALIASES:
				detailMsg = lang.get("accountSwitchAliases_msg")
				break

			case UnsubscribeFailureReason.TOO_MUCH_STORAGE_USED:
			case BookingFailureReason.TOO_MUCH_STORAGE_USED:
				detailMsg = lang.get("storageCapacityTooManyUsedForBooking_msg")
				break

			case UnsubscribeFailureReason.TOO_MANY_DOMAINS:
			case BookingFailureReason.TOO_MANY_DOMAINS:
				detailMsg = lang.get("tooManyCustomDomains_msg")
				break

			case UnsubscribeFailureReason.HAS_TEMPLATE_GROUP:
			case BookingFailureReason.HAS_TEMPLATE_GROUP:
				detailMsg = lang.get("deleteTemplateGroups_msg")
				break

			case UnsubscribeFailureReason.WHITELABEL_DOMAIN_ACTIVE:
			case BookingFailureReason.WHITELABEL_DOMAIN_ACTIVE:
				detailMsg = lang.get("whitelabelDomainExisting_msg")
				break

			default:
				detailMsg = lang.get("unknownError_msg")
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

async function switchSubscription(targetSubscription: PlanType, dialog: Dialog, currentSubscriptionInfo: CurrentSubscriptionInfo): Promise<PlanType> {
	if (targetSubscription === currentSubscriptionInfo.planType) {
		return currentSubscriptionInfo.planType
	}

	const userController = locator.logins.getUserController()
	const customer = await userController.loadCustomer()
	if (!customer.businessUse && NewBusinessPlans.includes(targetSubscription)) {
		const accountingInfo = await userController.loadAccountingInfo()
		const invoiceData: InvoiceData = {
			invoiceAddress: formatNameAndAddress(accountingInfo.invoiceName, accountingInfo.invoiceAddress),
			country: accountingInfo.invoiceCountry ? getByAbbreviation(accountingInfo.invoiceCountry) : null,
			vatNumber: accountingInfo.invoiceVatIdNo, // only for EU countries otherwise empty
		}
		const updatedInvoiceData = await showSwitchToBusinessInvoiceDataDialog(customer, invoiceData, accountingInfo)
		if (!updatedInvoiceData) {
			return currentSubscriptionInfo.planType
		}
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
