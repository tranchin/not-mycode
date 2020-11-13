// @flow

import m from "mithril"
import stream from "mithril/stream/stream.js"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {createWizardDialog, emitWizardEvent, WizardEventType} from "../../gui/base/WizardDialogN"
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
import type {WizardPageAttrs, WizardPageN} from "../../gui/base/WizardDialogN"
import {HtmlEditor, Mode} from "../../gui/base/HtmlEditor"
import {DropDownSelector} from "../../gui/base/DropDownSelector"
import {createCountryDropdown} from "../../gui/base/GuiUtils"
import {BuyOptionBox} from "../BuyOptionBox"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {formatPrice} from "../SubscriptionUtils"
import {formatNameAndAddress} from "../../misc/Formatter"

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


type CreateGiftCardAttrs = WizardPageAttrs<CreateGiftCardData>

class GiftCardCreationPage implements WizardPageN<CreateGiftCardData> {

	_messageEditor: HtmlEditor
	_selectedCountry: Stream<?Country>
	countrySelector: DropDownSelector<?Country>

	constructor(vnode: Vnode<CreateGiftCardAttrs>) {
		const data = vnode.attrs.data

		this._messageEditor = new HtmlEditor(() => "Type your message",) // TRANSLATE
			.setMinHeight(300)
			.setMode(Mode.WYSIWYG)
			.showBorders()
			.setValue(data.message)
			.setEnabled(true)

		this._selectedCountry = stream(null)
		this.countrySelector = createCountryDropdown(
			this._selectedCountry,
			() => "This card can only be redeemed in this country",
			() => "Select recipient's country") // Translate
	}

	view(vnode: Vnode<CreateGiftCardAttrs>): Children {
		const a = vnode.attrs
		return [
			m(".flex.center-horizontally.wrap",
				a.data.availablePackages.map((option, index) =>
					m(BuyOptionBox, {
						heading: `Option ${index}`, // TODO make nice headings
						actionButton: {
							view: () => m(ButtonN, {
								label: "pricing.select_action",
								click: () => {
									a.data.selectedPackageIndex = index
								},
								type: ButtonType.Login,
							})
						},
						price: formatPrice(parseInt(option.value), true),
						originalPrice: formatPrice(parseInt(option.value), true),
						helpLabel: "pricing.basePriceIncludesTaxes_msg",
						features: () => [],
						width: 230,
						height: 250,
						paymentInterval: null,
						highlighted: a.data.selectedPackageIndex === index,
						showReferenceDiscount: false,
					})
				)),
			m(this._messageEditor),
			m(this.countrySelector),
			m(ButtonN, {
				label: "next_action",
				click: () => {
					if (!this._selectedCountry()) {
						Dialog.error(() => "Select recipients country") // TODO Translate
						return
					}
					a.data.message = this._messageEditor.getValue()
					a.data.country = this._selectedCountry()
					emitWizardEvent(vnode.dom, WizardEventType.SHOWNEXTPAGE)
				},
				type: ButtonType.Login,
			})
		]
	}
}

/**
 * Ask for user confirmation of gift card
 */
class GiftCardConfirmationPage implements WizardPageN<CreateGiftCardData> {

	view(vnode: Vnode<CreateGiftCardAttrs>): Children {
		const a = vnode.attrs
		const confirmButtonAttr = {
			label: () => "Buy gift card", // Translate
			click: () => {
				emitWizardEvent(vnode.dom, WizardEventType.SHOWNEXTPAGE)
			},
			type: ButtonType.Login
		}
		return m(".confirm-giftcard-page.pt",
			m(".flex-v-center", [
				m("h3", "Invoice details:"),
				formatNameAndAddress(a.data.invoiceName, a.data.invoiceAddress, a.data.invoiceCountry),
				m(ButtonN, confirmButtonAttr),
			]))
	}
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
										      return true
									      })
									      .catch(e => {
										      Dialog.error(() => "Unable to purchase gift Cards")
										      return false
									      })
								)

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


// TODO maybe this is already written somewhere else?
// TODO call entityClient.load
function loadAccountingInfo(): Promise<AccountingInfo> {
	const info = load(CustomerTypeRef, neverNull(logins.getUserController().user.customer))
		.then(customer => load(CustomerInfoTypeRef, customer.customerInfo))
		.then(customerInfo => load(AccountingInfoTypeRef, customerInfo.accountingInfo))

	return info
}
