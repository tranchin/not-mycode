// @flow

import type {WizardPageAttrs, WizardPageN} from "../../gui/base/WizardDialogN"
import {emitWizardEvent, WizardEventType} from "../../gui/base/WizardDialogN"
import m from "mithril"
import stream from "mithril/stream/stream.js"
import type {CreateGiftCardData} from "./CreateGiftCardWizard"
import {CreateGiftCardOverview} from "./CreateGiftCardOverview"
import {HtmlEditor, Mode} from "../../gui/base/HtmlEditor"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {createCountryDropdown} from "../../gui/base/GuiUtils"
import {DropDownSelector} from "../../gui/base/DropDownSelector"
import type {Country} from "../../api/common/CountryList"
import {Dialog} from "../../gui/base/Dialog"
import {BuyOptionBox} from "../BuyOptionBox"
import {formatPrice} from "../SubscriptionUtils"

type CreateGiftCardAttrs = WizardPageAttrs<CreateGiftCardData>

export class GiftCardCreationPage implements WizardPageN<CreateGiftCardData> {

	_messageEditor: HtmlEditor
	_selectedPackageIndex: Stream<number>
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

		this._selectedPackageIndex = stream(data.selectedPackageIndex)

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
					a.data.selectedPackageIndex = this._selectedPackageIndex()
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
export class GiftCardConfirmationPage implements WizardPageN<CreateGiftCardData> {
	view(vnode: Vnode<CreateGiftCardAttrs>): Children {
		const a = vnode.attrs
		return m(".confirm-giftcard-page.pt", [
				m(CreateGiftCardOverview, {
					data: a.data,
					boxWidth: 230,
					boxHeight: 250,
					wizardDom: () => vnode.dom
				})
			]
		)
	}
}

