// @flow

import m from "mithril"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {createWizardDialog} from "../../gui/base/WizardDialogN"
import {loadUpgradePrices} from "../UpgradeSubscriptionWizard"
import {GiftCardConfirmationPage, GiftCardCreationPage} from "./CreateGiftCardWizardPages"
import {load, serviceRequest} from "../../api/main/Entity"
import {CustomerTypeRef} from "../../api/entities/sys/Customer"
import {assertNotNull, neverNull} from "../../api/common/utils/Utils"
import {logins} from "../../api/main/LoginController"
import {CustomerInfoTypeRef} from "../../api/entities/sys/CustomerInfo"
import type {AccountingInfo} from "../../api/entities/sys/AccountingInfo"
import {AccountingInfoTypeRef} from "../../api/entities/sys/AccountingInfo"
import {worker} from "../../api/main/WorkerClient"
import {showProgressDialog} from "../../gui/base/ProgressDialog"
import type {GiftCard} from "../../api/entities/sys/GiftCard"
import {locator} from "../../api/main/MainLocator"
import {GiftCardTypeRef} from "../../api/entities/sys/GiftCard"
import type {Country} from "../../api/common/CountryList"
import {SysService} from "../../api/entities/sys/Services"
import {HttpMethod} from "../../api/common/EntityFunctions"
import {GiftCardGetReturnTypeRef} from "../../api/entities/sys/GiftCardGetReturn"
import type {GiftCardOption} from "../../api/entities/sys/GiftCardOption"

export type CreateGiftCardData = {
	availablePackages: Array<GiftCardOption>;
	selectedPackageIndex: number;

	message: string;
	giftCard: ?GiftCard,

	country: ?Country;
	invoiceAddress: string;
	invoiceCountry: string;
	invoiceName: string;
	paymentMethod: ?NumberString;
}


// TODO maybe this is already written somewhere else?
// TODO call entityClient.load
function loadAccountingInfo(): Promise<AccountingInfo> {
	const info = load(CustomerTypeRef, neverNull(logins.getUserController().user.customer))
		.then(customer => load(CustomerInfoTypeRef, customer.customerInfo))
		.then(customerInfo => load(AccountingInfoTypeRef, customerInfo.accountingInfo))

	return info
}

export function showPurchaseGiftCardWizard(): Promise<?GiftCard> {
	return serviceRequest(SysService.GiftCardService, HttpMethod.GET, null, GiftCardGetReturnTypeRef)
		.then(availablePackages => {
			return loadAccountingInfo().then((accountingInfo: AccountingInfo) => {
				const data: CreateGiftCardData = {
					availablePackages: availablePackages.options,
					selectedPackageIndex: Math.floor(availablePackages.options.length / 2),
					message: "Hey, I bought you a gift card!<br />LG,<br />{name}", // Translate defaultGiftCardMessage_msg
					giftCard: null,
					country: null,
					invoiceAddress: accountingInfo.invoiceAddress,
					invoiceCountry: accountingInfo.invoiceCountry || "",
					invoiceName: accountingInfo.invoiceName,
					paymentMethod: accountingInfo.paymentMethod
				};

				const wizardPages = [
					{
						attrs: {
							data: data,
							headerTitle: () => "Select type", // Translate
							nextAction: (showErrorDialog: boolean) => Promise.resolve(true),
							isSkipAvailable: () => false,
							isEnabled: () => true,
						},
						componentClass: GiftCardCreationPage
					},
					{
						attrs: {
							data: data,
							headerTitle: () => "Confirm gift card", // Translate
							nextAction: (_) => {
								return showProgressDialog("loading_msg",
									worker.generateGiftCard(data.message, data.availablePackages[data.selectedPackageIndex].value, assertNotNull(data.country).a)
									      .then(createdGiftCardId => locator.entityClient.load(GiftCardTypeRef, createdGiftCardId)) // TODO dependency inject entityClient?
									      .then(giftCard => {
										      data.giftCard = giftCard
										      return giftCard
											      ? Promise.resolve(true)
											      : Dialog.error(() => "Error").then(() => false)
									      }))
							},
							isSkipAvailable: () => false,
							isEnabled: () => true
						},
						componentClass: GiftCardConfirmationPage
					},

				]

				const wizardBuilder = createWizardDialog(data, wizardPages, () => {
					return Promise.resolve()
				})

				wizardBuilder.dialog.show()
				return wizardBuilder.promise.then(() => data.giftCard)
			})
		})
}
