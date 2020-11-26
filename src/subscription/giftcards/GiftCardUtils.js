// @flow

import m from "mithril"
import QRCode from "qrcode"
import {PaymentMethodType, reverse} from "../../api/common/TutanotaConstants"
import {Icons} from "../../gui/base/icons/Icons"
import type {TableLineAttrs} from "../../gui/base/TableN"
import {formatDate} from "../../misc/Formatter"
import {worker} from "../../api/main/WorkerClient"
import type {CustomerInfo} from "../../api/entities/sys/CustomerInfo"
import {CustomerInfoTypeRef} from "../../api/entities/sys/CustomerInfo"
import {CustomerTypeRef} from "../../api/entities/sys/Customer"
import {locator} from "../../api/main/MainLocator"
import type {GiftCard} from "../../api/entities/sys/GiftCard"
import {_TypeModel as GiftCardTypeModel, GiftCardTypeRef} from "../../api/entities/sys/GiftCard"
import type {TranslationKey} from "../../misc/LanguageViewModel"
import {UserError} from "../../api/common/error/UserError"
import {formatPrice} from "../SubscriptionUtils"
import type {GiftCardRedeemGetReturn} from "../../api/entities/sys/GiftCardRedeemGetReturn"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {attachDropdown} from "../../gui/base/DropdownN"
import {getDifferenceInDays} from "../../api/common/utils/DateUtils"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {HtmlEditor} from "../../gui/base/HtmlEditor"
import {htmlSanitizer} from "../../misc/HtmlSanitizer"
import {serviceRequest, serviceRequestVoid} from "../../api/main/Entity"
import {createGiftCardDeleteData, GiftCardDeleteDataTypeRef} from "../../api/entities/sys/GiftCardDeleteData"
import {HttpMethod} from "../../api/common/EntityFunctions"
import {SysService} from "../../api/entities/sys/Services"
import {px, size} from "../../gui/size"
import {showPurchaseGiftCardWizard} from "./CreateGiftCardWizard"
import {logins} from "../../api/main/LoginController"
import {assertNotNull, neverNull} from "../../api/common/utils/Utils"
import {LocationServiceGetReturnTypeRef} from "../../api/entities/sys/LocationServiceGetReturn"
import {getByAbbreviation} from "../../api/common/CountryList"
import {createGiftCardRedeemData} from "../../api/entities/sys/GiftCardRedeemData"
import {emitWizardEvent, WizardEventType} from "../../gui/base/WizardDialogN"
import {NotAuthorizedError, NotFoundError} from "../../api/common/error/RestError"
import {CancelledError} from "../../api/common/error/CancelledError"
import type {Theme} from "../../gui/theme"
import {theme} from "../../gui/theme"
import {writeGiftCardMail} from "../../mail/MailEditorN"
import {DefaultAnimationTime} from "../../gui/animation/Animations"
import {copyToClipboard} from "../../misc/ClipboardUtils"
import {BootIcons} from "../../gui/base/icons/BootIcons"
import {lang} from "../../misc/LanguageViewModel"

export const MAX_PURCHASED_GIFTCARDS = 10

export function getTokenFromUrl(url: string): [IdTuple, string] {
	let id: IdTuple, key: string;
	const token = url.substr(url.indexOf("#") + 1)
	try {
		if (!token) {
			throw new Error()
		}
		[id, key] = _decodeToken(token)
	} catch (e) {
		throw new UserError(() => "Invalid gift card link")
	}
	return [id, key]
}

export function redeemGiftCard(id: IdTuple, validCountryCode: string, getConfirmation: (TranslationKey | lazy<string>) => Promise<boolean>): Promise<void> {
	// Check that the country matches
	return serviceRequest(SysService.LocationService, HttpMethod.GET, null, LocationServiceGetReturnTypeRef)
		.then(userLocation => {
			const validCountry = getByAbbreviation(validCountryCode)
			if (!validCountry) {
				throw new UserError(() => "Invalid gift card")
			}
			const validCountryName = validCountry.n

			const userCountry = getByAbbreviation(userLocation.country)
			const userCountryName = assertNotNull(userCountry).n

			return userCountryName === validCountryName
				|| getConfirmation(() => `Country different: you ${userCountryName} but gift card ${validCountryName}`) // TODO Translate
		})
		.then(confirmed => {
			if (!confirmed) throw new CancelledError("") // TODO is this the right error?
		})
		.then(() => {
			const requestEntity = createGiftCardRedeemData({giftCard: id})
			return serviceRequestVoid(SysService.GiftCardRedeemService, HttpMethod.POST, requestEntity)
				.catch(NotFoundError, () => { throw new UserError(() => "Gift card was not found") }) // TODO Translate
				.catch(NotAuthorizedError, e => { throw new UserError(() => e.message) })
		})
}

export function canBuyGiftCards(): Promise<boolean> {
	return logins.getUserController()
	             .loadAccountingInfo()
	             .then(accountingInfo => accountingInfo.paymentMethod != null && accountingInfo.paymentMethod !== PaymentMethodType.Invoice)
}

export function loadGiftCards(customerId: Id): Promise<GiftCard[]> {
	const entityClient = locator.entityClient

	return entityClient.load(CustomerTypeRef, customerId)
	                   .then(customer => entityClient.load(CustomerInfoTypeRef, customer.customerInfo))
	                   .then((customerInfo: CustomerInfo) => {
		                   if (customerInfo.giftCards) {
			                   return entityClient.loadAll(GiftCardTypeRef, customerInfo.giftCards.items)
		                   } else {
			                   return Promise.resolve([])
		                   }
	                   })
}

export const GIFT_CARD_TABLE_HEADER: Array<lazy<string> | TranslationKey> = [() => "Purchase Date", () => "Package", () => "Status"]

export function createGiftCardTableLine(giftCard: GiftCard): TableLineAttrs { // TODO

	const statusLabel = giftCard.usable
		? 'Available' // TODO Translate
		: 'Unavailable'

	const showEditGiftCardMessageDialog = () => {
		const editor = new HtmlEditor(() => "Edit message", {enabled: true})
			.setMinHeight(350)
			.setValue(giftCard.message)

		Dialog.showActionDialog({
			title: () => "Edit message", // Translate
			child: () => m(".gift-card-editor.pl-l.pr-l", m(editor)),
			okAction: dialog => {
				giftCard.message = editor.getValue()
				locator.entityClient.update(giftCard)
				       .then(() => dialog.close())
				       .catch(e => Dialog.error(() => "Failed to update" + e)) // TODO Translate
			},
			type: DialogType.EditLarger
		})
	}

	const actionButtons = [
		{
			label: () => "view giftcard", // Translate
			click: () => showGiftCardToShare(giftCard),
			type: ButtonType.Dropdown
		},
		{
			label: () => "edit message", // Translate
			click: showEditGiftCardMessageDialog,
			type: ButtonType.Dropdown
		}
	]

	const showMoreButtonAttrs = attachDropdown({
			label: () => "options",
			click: () => showGiftCardToShare(giftCard),
			icon: () => Icons.More,
			type: ButtonType.Dropdown
		},
		() => actionButtons)

	return {
		cells: [
			formatDate(giftCard.orderDate),
			formatPrice(parseFloat(giftCard.value), true), // TODO Why is it necessary to be parsing numberstrings instead of just having numbers
			statusLabel
		],
		actionButtonAttrs: showMoreButtonAttrs
	}
}

export function generateGiftCardLink(giftCard: GiftCard): Promise<string> {
	return worker.resolveSessionKey(GiftCardTypeModel, giftCard).then(key => {

		if (!key) {
			throw new UserError(() => "Error with giftcard") // TODO Translate
		}

		return `http://localhost:9000/client/build/giftcard/#${_encodeToken(giftCard._id, key)}` // TODO BIG TODO generate actual link
	})
}

function _encodeToken(id: IdTuple, key: string): Base64 {
	const tokenJSON = JSON.stringify([id, key])
	return btoa(tokenJSON) // TODO maybe this is breakable???? Maybe it generates invalid characters for a url
}

function _decodeToken(token: Base64): [IdTuple, string] {
	const tokenJSON = atob(token)
	return JSON.parse(tokenJSON)
}

export function showGiftCardToShare(giftCard: GiftCard) {

	generateGiftCardLink(giftCard)
		.then(link => {
			let qrcodeGenerator = new QRCode({height: 150, width: 150, content: link})
			const qrCode = htmlSanitizer.sanitize(qrcodeGenerator.svg(), false).text
			let linkCopied = ""
			let dialog: Dialog
			dialog = Dialog.largeDialog(
				{
					right: [
						{
							type: ButtonType.Secondary,
							label: "close_alt",
							click: () => dialog.close()
						}
					],
					middle: () => lang.get("giftCard_label")
				},
				{
					view: () =>
						m("", {style: {padding: px(size.vpad_large)}},
							[
								m(".flex-center.full-width.pt-l",
									m("", {style: {width: "480px"}}, renderGiftCard(parseFloat(giftCard.value), giftCard.message))
								),
								m(".flex-center", m.trust(qrCode)), // sanitized above
								m(".flex-center", [
										m(ButtonN, {
											click: () => {
												dialog.close()
												setTimeout(() => writeGiftCardMail(link), DefaultAnimationTime)
											},
											label: () => "Share via email", // TODO Translate
											icon: () => BootIcons.Share
										}),
										m(ButtonN, {
											click: () => {
												copyToClipboard(link)
												linkCopied = "Gift card link copied to clipboard!" // TODO Translate
											},
											label: () => "Copy link", // TODO Translate
											icon: () => Icons.Send
										}),

									]
								),
								m(".flex-center", m("small", linkCopied))
							]
						)
				}).show()
		})
}

export function renderGiftCardSvg(price: number): Children {
	const formattedPrice = formatPrice(price, true)
	return m("", {style: {maxWidth: "480px"}}, m.trust(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 243.653 152.991"><path d="M6.911 0A6.896 6.896 0 000 6.91v139.17a6.896 6.896 0 006.911 6.91h109.124c3.778-1.31 7.43-3.004 11.147-4.488 34.047-13.59 61.882-25.146 61.907-38.193 0-.418-.029-.84-.088-1.262-1.76-12.881-32.544-16.875-32.501-22.778.005-.314.092-.642.281-.97 3.698-6.476 18.345-6.166 23.74-6.624 5.398-.469 18.069-.372 18.68-4.231.019-.12.03-.238.03-.357.015-3.586-8.713-4.992-8.713-4.992s10.59 1.582 10.562 5.702c0 .202-.025.41-.081.623-1.14 4.426-10.46 5.259-16.623 5.561-5.828.292-14.703.956-14.733 3.802-.005.166.025.34.085.516 1.39 4.162 33.92 6.166 54.732 16.968 10.165 5.27 15.992 13.582 19.193 22.564V6.911A6.896 6.896 0 00236.743 0z" fill="${theme.content_accent}"/><path d="M24.996 18.992h-9.332v-1.767h20.585v1.767h-9.333v26.653h-1.92V18.992zM35.75 40.115V25.482h1.843v14.402c0 3.073 1.344 4.57 4.417 4.57 2.803 0 5.146-1.459 7.642-3.84V25.482h1.844v20.163H49.65v-3.341c-2.227 2.112-4.839 3.764-7.796 3.764-4.186 0-6.106-2.305-6.106-5.953zm23.85 1.037V27.133h-3.534v-1.651h3.533v-7.335h1.844v7.335h5.261v1.652h-5.261v13.748c0 2.151.73 3.38 3.264 3.38.768 0 1.536-.077 2.112-.268v1.728c-.652.115-1.42.192-2.265.192-3.342 0-4.955-1.344-4.955-4.762zm11.136-.154c0-3.84 3.264-6.721 13.865-8.488v-1.229c0-3.072-1.614-4.608-4.379-4.608-3.341 0-5.569 1.305-7.835 3.341l-1.075-1.152c2.497-2.304 5.07-3.802 8.948-3.802 4.187 0 6.184 2.38 6.184 6.106v9.486c0 2.458.154 3.956.576 4.993H85.06a9.82 9.82 0 01-.46-2.996c-2.459 2.113-5.147 3.342-8.181 3.342-3.687 0-5.684-1.92-5.684-4.993zm13.864-.154v-6.951c-9.831 1.728-12.02 4.147-12.02 6.99 0 2.265 1.497 3.494 3.993 3.494 2.996 0 5.723-1.305 8.027-3.533zm8.143 4.801V25.367h3.34V28.4c1.768-1.728 4.302-3.456 7.605-3.456 3.88 0 5.991 2.227 5.991 6.068v14.632h-3.302V31.742c0-2.688-1.152-3.955-3.726-3.955-2.419 0-4.455 1.267-6.567 3.264v14.594h-3.341zm21.775-10.14c0-6.989 4.455-10.56 9.448-10.56 4.954 0 9.41 3.571 9.41 10.56 0 6.952-4.456 10.562-9.41 10.562-4.955 0-9.448-3.61-9.448-10.561zm15.516 0c0-4.224-2.036-7.719-6.068-7.719-3.88 0-6.107 3.15-6.107 7.72 0 4.301 1.997 7.758 6.107 7.758 3.84 0 6.068-3.111 6.068-7.758zm9.83 5.224V28.094h-3.532v-2.727h3.533v-7.22h3.303v7.22h5.261v2.727h-5.262V40c0 2.15.692 3.226 3.15 3.226.73 0 1.536-.116 2.074-.27v2.728c-.577.115-1.844.23-2.88.23-4.264 0-5.646-1.651-5.646-5.185zm12.137.115c0-4.11 3.495-7.028 13.557-8.45v-.92c0-2.536-1.344-3.764-3.84-3.764-3.073 0-5.339 1.344-7.336 3.072l-1.728-2.074c2.342-2.15 5.377-3.764 9.41-3.764 4.838 0 6.758 2.535 6.758 6.76v8.948c0 2.458.154 3.956.577 4.993h-3.38c-.269-.845-.46-1.652-.46-2.804-2.267 2.113-4.801 3.111-7.836 3.111-3.495 0-5.722-1.843-5.722-5.108zm13.557-.46V34.7c-7.72 1.229-10.293 3.11-10.293 5.645 0 1.959 1.306 2.996 3.418 2.996 2.689 0 4.993-1.114 6.875-2.958z" fill="${theme.content_bg}"/><text style="line-height:1.25" x="-119.522" y="203.681" font-weight="400" font-size="22.462" letter-spacing="0" word-spacing="0" font-family="sans-serif" fill="${theme.content_bg}" stroke-width=".562" transform="translate(143.75 -74.606)"><tspan x="-119.522" y="203.681">${formattedPrice}</tspan></text><text style="line-height:1.25" x="-118.577" y="135.988" font-weight="400" font-size="11.073" letter-spacing="0" word-spacing="0" font-family="sans-serif" fill="${theme.content_bg}" stroke-width=".277" transform="translate(143.75 -74.606)"><tspan x="-118.577" y="135.988">${lang.get("giftCard_label")}</tspan></text></svg>`))
}

export function renderGiftCard(value: number, message: string): Children {

	return [
		m(".flex-center.full-width.pt-l.editor-border",
			m(".pt-s.pb-s", {style: {width: "260px"}},
				m.trust(htmlSanitizer.sanitize(message, true).text),
			),
		),
		m(".pt-l", renderGiftCardSvg(parseFloat(value))),
	]
}

export function showGiftCardConfirmationDialog(wasFree: boolean, okAction?: () => void) {
	let dialog
	dialog = Dialog.showActionDialog({
		title: () => "You got a gift card!",
		child: () => m(".pt.pb", "The gift card has been redeemed." + (wasFree ? "You account was upgraded to premium." : "")),
		allowCancel: false,
		okAction: () => {
			okAction && okAction()
			dialog.close()
		}
	})
}