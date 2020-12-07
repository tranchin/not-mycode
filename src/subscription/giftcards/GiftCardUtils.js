// @flow

import m from "mithril"
import QRCode from "qrcode"
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
import {lang} from "../../misc/LanguageViewModel"
import {UserError} from "../../api/common/error/UserError"
import {formatPrice, showServiceTerms} from "../SubscriptionUtils"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {attachDropdown} from "../../gui/base/DropdownN"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {HtmlEditor} from "../../gui/base/HtmlEditor"
import {htmlSanitizer} from "../../misc/HtmlSanitizer"
import {serviceRequest, serviceRequestVoid} from "../../api/main/Entity"
import {elementIdPart, HttpMethod} from "../../api/common/EntityFunctions"
import {SysService} from "../../api/entities/sys/Services"
import {px, size} from "../../gui/size"
import {assertNotNull} from "../../api/common/utils/Utils"
import {LocationServiceGetReturnTypeRef} from "../../api/entities/sys/LocationServiceGetReturn"
import {getByAbbreviation} from "../../api/common/CountryList"
import {createGiftCardRedeemData} from "../../api/entities/sys/GiftCardRedeemData"
import {NotAuthorizedError, NotFoundError} from "../../api/common/error/RestError"
import {CancelledError} from "../../api/common/error/CancelledError"
import {theme} from "../../gui/theme"
import {writeGiftCardMail} from "../../mail/MailEditorN"
import {DefaultAnimationTime} from "../../gui/animation/Animations"
import {copyToClipboard} from "../../misc/ClipboardUtils"
import {BootIcons} from "../../gui/base/icons/BootIcons"
import {base64ToBase64Url, base64UrlToBase64} from "../../api/common/utils/Encoding"
import {getWebRoot, isApp} from "../../api/Env"
import {splitAt} from "../../api/common/utils/StringUtils"
import {shareTextNative} from "../../native/SystemApp"
import {CheckboxN} from "../../gui/base/CheckboxN"

export function getTokenFromUrl(url: string): [Id, string] {
	let id: Id, key: string;
	const token = url.substr(url.indexOf("#") + 1)
	try {
		if (!token) {
			throw new Error()
		}
		[id, key] = _decodeToken(token)
	} catch (e) {
		throw new UserError("invalidGiftCard_msg")
	}
	return [id, key]
}

export function redeemGiftCard(giftCardId: IdTuple, validCountryCode: string, getConfirmation: (TranslationKey | lazy<string>) => Promise<boolean>): Promise<void> {
	// Check that the country matches
	return serviceRequest(SysService.LocationService, HttpMethod.GET, null, LocationServiceGetReturnTypeRef)
		.then(userLocation => {
			const validCountry = getByAbbreviation(validCountryCode)
			if (!validCountry) {
				throw new UserError("invalidGiftCard_msg")
			}
			const validCountryName = validCountry.n

			const userCountry = getByAbbreviation(userLocation.country)
			const userCountryName = assertNotNull(userCountry).n

			return userCountryName === validCountryName
				|| getConfirmation(() => lang.get("validGiftCardCountry_msg", {
					"{valid}": validCountryName,
					"{actual}": userCountryName
				}))
		})
		.then(confirmed => {
			if (!confirmed) throw new CancelledError("")
		})
		.then(() => {
			const requestEntity = createGiftCardRedeemData({giftCardInfo: elementIdPart(giftCardId)})
			return serviceRequestVoid(SysService.GiftCardRedeemService, HttpMethod.POST, requestEntity)
				.catch(NotFoundError, () => { throw new UserError("invalidGiftCard_msg") })
				.catch(NotAuthorizedError, e => { throw new UserError(() => e.message) })
		})
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

export const GIFT_CARD_TABLE_HEADER: Array<lazy<string> | TranslationKey> = ["purchaseDate_label", "value_label", "state_label"]

export function createGiftCardTableLine(giftCard: GiftCard): TableLineAttrs { // TODO

	const statusLabel = giftCard.usable
		? "available_label"
		: "unavailable_label"

	const showEditGiftCardMessageDialog = () => {
		const editor = new HtmlEditor("editMessage_label", {enabled: true})
			.setMinHeight(350)
			.setValue(giftCard.message)

		Dialog.showActionDialog({
			title: lang.get("editMessage_label"),
			child: () => m(".gift-card-editor.pl-l.pr-l", m(editor)),
			okAction: dialog => {
				giftCard.message = editor.getValue()
				locator.entityClient.update(giftCard)
				       .then(() => dialog.close())
				       .catch(e => Dialog.error("giftCardUpdateError_msg"))
			},
			type: DialogType.EditLarger
		})
	}

	const showMoreButtonAttrs = attachDropdown({
			label: "options_action",
			click: () => showGiftCardToShare(giftCard),
			icon: () => Icons.More,
			type: ButtonType.Dropdown
		},
		() => [
			{
				label: "view_label",
				click: () => showGiftCardToShare(giftCard),
				type: ButtonType.Dropdown
			},
			{
				label: "edit_action",
				click: showEditGiftCardMessageDialog,
				type: ButtonType.Dropdown
			}
		])

	return {
		cells: [
			formatDate(giftCard.orderDate),
			formatPrice(parseFloat(giftCard.value), true),
			lang.get(statusLabel)
		],
		actionButtonAttrs: showMoreButtonAttrs
	}
}

export function generateGiftCardLink(giftCard: GiftCard): Promise<string> {
	return worker.resolveSessionKey(GiftCardTypeModel, giftCard).then(key => {
		// This should not assert false and if it does we want to know about it
		key = assertNotNull(key)
		return getWebRoot() + `/giftcard/#${_encodeToken(elementIdPart(giftCard._id), key)}`
	})
}

function _encodeToken(id: Id, key: string): Base64 {
	const tokenJSON = JSON.stringify([id, key])
	return base64ToBase64Url(btoa(tokenJSON))
}

function _decodeToken(token: Base64): [Id, string] {
	const tokenJSON = atob(base64UrlToBase64(token))
	return JSON.parse(tokenJSON)
}

export function showGiftCardToShare(giftCard: GiftCard) {
	generateGiftCardLink(giftCard)
		.then(link => {
			let dialog: Dialog
			let infoMessage = "emptyString_msg"
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
									m("", {style: {width: "480px"}}, renderGiftCard(parseFloat(giftCard.value), giftCard.message, link))
								),
								m(".flex-center",
									[
										m(ButtonN, {
											click: () => {
												dialog.close()
												setTimeout(() => writeGiftCardMail(link), DefaultAnimationTime)
											},
											label: "shareViaEmail_action",
											icon: () => BootIcons.Mail
										}),
										isApp()
											? m(ButtonN, {
												click: () => {
													shareTextNative(lang.get("nativeShareGiftCard_msg", {"{link}": link}), lang.get("nativeShareGiftCard_label"))
												},
												label: "share_action",
												icon: () => BootIcons.Share
											})
											: [
												m(ButtonN, {
													click: () => {
														copyToClipboard(link)
															.then(() => {infoMessage = "giftCardCopied_msg"})
															.catch(() => {infoMessage = "copyLinkError_msg"})
													},
													label: "copyToClipboard_action",
													icon: () => Icons.Clipboard
												}),
												m(ButtonN, {
													click: () => {
														infoMessage = "emptyString_msg"
														window.print()
													},
													label: "print_action",
													icon: () => Icons.Print
												})
											]
									]
								),
								m(".flex-center", m("small.noprint", lang.getMaybeLazy(infoMessage)))
							]
						)
				}).show()
		})
}

export function renderGiftCardSvg(price: number, link: ?string, message: ?string, portrait: boolean = true): Children {
	let qrCode = null
	const qrcodeSize = portrait ? 120 : 60
	if (link) {
		let qrcodeGenerator = new QRCode({
			height: qrcodeSize,
			width: qrcodeSize,
			content: link,
			background: theme.content_accent,
			color: theme.content_bg
		})
		qrCode = htmlSanitizer.sanitize(qrcodeGenerator.svg({container: null}), false).text
	}

	const formattedPrice = formatPrice(price, true)
	const height = portrait ? 300 : 140
	const width = 240

	return m("svg", {
			style: {
				maxWidth: "960px", minwidth: "480px", background: theme.content_accent, borderRadius: px(20),
				"-webkit-print-color-adjust": "exact",
				"color-adjust": "exact"
			},
			viewBox: `0 0 ${width} ${height}`
		},
		[
			m("path", { /* tutanota logo text */
				fill: theme.elevated_bg,
				d: "M24.996 18.992h-9.332v-1.767h20.585v1.767h-9.333v26.653h-1.92V18.992zM35.75 40.115V25.482h1.843v14.402c0 3.073 1.344 4.57 4.417 4.57 2.803 0 5.146-1.459 7.642-3.84V25.482h1.844v20.163H49.65v-3.341c-2.227 2.112-4.839 3.764-7.796 3.764-4.186 0-6.106-2.305-6.106-5.953zm23.85 1.037V27.133h-3.534v-1.651h3.533v-7.335h1.844v7.335h5.261v1.652h-5.261v13.748c0 2.151.73 3.38 3.264 3.38.768 0 1.536-.077 2.112-.268v1.728c-.652.115-1.42.192-2.265.192-3.342 0-4.955-1.344-4.955-4.762zm11.136-.154c0-3.84 3.264-6.721 13.865-8.488v-1.229c0-3.072-1.614-4.608-4.379-4.608-3.341 0-5.569 1.305-7.835 3.341l-1.075-1.152c2.497-2.304 5.07-3.802 8.948-3.802 4.187 0 6.184 2.38 6.184 6.106v9.486c0 2.458.154 3.956.576 4.993H85.06a9.82 9.82 0 01-.46-2.996c-2.459 2.113-5.147 3.342-8.181 3.342-3.687 0-5.684-1.92-5.684-4.993zm13.864-.154v-6.951c-9.831 1.728-12.02 4.147-12.02 6.99 0 2.265 1.497 3.494 3.993 3.494 2.996 0 5.723-1.305 8.027-3.533zm8.143 4.801V25.367h3.34V28.4c1.768-1.728 4.302-3.456 7.605-3.456 3.88 0 5.991 2.227 5.991 6.068v14.632h-3.302V31.742c0-2.688-1.152-3.955-3.726-3.955-2.419 0-4.455 1.267-6.567 3.264v14.594h-3.341zm21.775-10.14c0-6.989 4.455-10.56 9.448-10.56 4.954 0 9.41 3.571 9.41 10.56 0 6.952-4.456 10.562-9.41 10.562-4.955 0-9.448-3.61-9.448-10.561zm15.516 0c0-4.224-2.036-7.719-6.068-7.719-3.88 0-6.107 3.15-6.107 7.72 0 4.301 1.997 7.758 6.107 7.758 3.84 0 6.068-3.111 6.068-7.758zm9.83 5.224V28.094h-3.532v-2.727h3.533v-7.22h3.303v7.22h5.261v2.727h-5.262V40c0 2.15.692 3.226 3.15 3.226.73 0 1.536-.116 2.074-.27v2.728c-.577.115-1.844.23-2.88.23-4.264 0-5.646-1.651-5.646-5.185zm12.137.115c0-4.11 3.495-7.028 13.557-8.45v-.92c0-2.536-1.344-3.764-3.84-3.764-3.073 0-5.339 1.344-7.336 3.072l-1.728-2.074c2.342-2.15 5.377-3.764 9.41-3.764 4.838 0 6.758 2.535 6.758 6.76v8.948c0 2.458.154 3.956.577 4.993h-3.38c-.269-.845-.46-1.652-.46-2.804-2.267 2.113-4.801 3.111-7.836 3.111-3.495 0-5.722-1.843-5.722-5.108zm13.557-.46V34.7c-7.72 1.229-10.293 3.11-10.293 5.645 0 1.959 1.306 2.996 3.418 2.996 2.689 0 4.993-1.114 6.875-2.958z"
			}),
			m("text", { /* price */
				"text-anchor": "end",
				x: 230, y: 30,
				fill: theme.elevated_bg,
				"font-size": "1.6rem"
			}, formattedPrice),
			m("text", { /* translation of "gift card" */
				"text-anchor": "end",
				x: 170, y: 65,
				fill: theme.elevated_bg
			}, lang.get("giftCard_label")),
			qrCode
				? m("g", {
					transform: portrait ? `translate(${width / 2 - qrcodeSize / 2} 90)` : "translate(20 73)"
				}, m.trust(qrCode))
				: null,
			m("path", {
				fill: theme.elevated_bg,
				transform: `translate(117 ${height - 80})`,
				d: "M74.483 0s8.728 1.406 8.713 4.992c0 .12-.011.237-.029.357-.612 3.86-13.283 3.762-18.682 4.23-5.394.459-20.04.149-23.739 6.625a1.996 1.996 0 00-.28.97c-.043 5.903 30.74 9.897 32.5 22.778.06.422.088.844.088 1.262-.025 13.047-27.86 24.602-61.907 38.193C7.43 80.891 3.78 82.585 0 83.896h127.618v-28.16c-3.2-8.982-9.027-17.293-19.193-22.564C87.613 22.37 55.084 20.366 53.693 16.204c-.06-.177-.09-.35-.085-.516.03-2.846 8.905-3.51 14.734-3.802 6.162-.302 15.481-1.135 16.622-5.56.056-.213.08-.422.08-.624C85.075 1.582 74.484 0 74.484 0z"
			})
		]
	)
}

export function renderGiftCard(value: number, message: string, link: ?string, portrait: boolean = true): Children {
	return [
		m(".flex-center.full-width.pt-l.editor-border.noprint",
			m(".pt-s.pb-s", {style: {width: "260px"}},
				m.trust(htmlSanitizer.sanitize(message, true).text),
			),
		),
		m(".pt-l", renderGiftCardSvg(parseFloat(value), link, message, portrait)),
	]
}

export function showGiftCardWasRedeemedDialog(wasFree: boolean, okAction?: () => void) {
	let dialog
	dialog = Dialog.showActionDialog({
		title: lang.get("success_label"),
		child: () => m(".pt.pb", [m("p", lang.get("giftCardRedeemed_msg")), wasFree ? m("p", lang.get("redeemedToPremium_msg")) : null]),
		allowCancel: false,
		okAction: () => {
			okAction && okAction()
			dialog.close()
		}
	})
}

export function renderAcceptGiftCardTermsCheckbox(confirmed: Stream<boolean>): Children {
	return m(CheckboxN, { // TODO
		checked: confirmed,
		label: () => [
			m("div", lang.get("giftCardsTerms_label")),
			m("div", m(`a[href=${lang.getInfoLink("giftCardsTerms_link")}][target=_blank]`, {
				onclick: e => {
					if (isApp()) {
						showServiceTerms("giftCards")
						e.preventDefault()
					}
				}
			}, lang.get("giftCardsTermsLink_label"))),
		],
	})
}