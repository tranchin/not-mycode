// @flow

import m from "mithril"
import QRCode from "qrcode"
import {reverse} from "../../api/common/TutanotaConstants"
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
import {Dialog} from "../../gui/base/Dialog"
import {attachDropdown} from "../../gui/base/DropdownN"
import {getDifferenceInDays} from "../../api/common/utils/DateUtils"
import {ButtonType} from "../../gui/base/ButtonN"
import {HtmlEditor} from "../../gui/base/HtmlEditor"
import {htmlSanitizer} from "../../misc/HtmlSanitizer"

export const MAX_PURCHASED_GIFTCARDS = 10

export const GiftCardTranslateus =
	Object.freeze({
		Pending: "0",
		Paid: "1",
	})

export function loadGiftCardInfoFromHash(hash: string): Promise<GiftCardRedeemGetReturn> {

	let id: IdTuple, key: string;
	const encodedToken = hash.startsWith("#") ? hash.substr(1) : null;
	try {
		if (!encodedToken) {
			throw new Error()
		}
		[id, key] = _decodeToken(encodedToken)
	} catch (e) {
		return Promise.reject(new UserError(() => "Invalid gift card link"))
	}
	return worker.initialized.then(() => {
		return worker.getGiftCardInfo(id, key)
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

export const GIFT_CARD_TABLE_HEADER: Array<lazy<string> | TranslationKey> = [() => "Purchase Date", () => "Package", () => "Status"]

export function createGiftCardTableLine(giftCard: GiftCard): TableLineAttrs { // TODO

	const statusLabel = giftCard.redeemedDate
		? `Redeemed` // TODO Translate
		: `Available`


	const showEditGiftCardMessageDialog = () => {
		const editor = new HtmlEditor()
			.setMinHeight(350)
			.setValue(giftCard.message)

		Dialog.showActionDialog({
			title: () => "Edit message", // Translate
			child: () => m(editor),
			okAction: dialog => {
				giftCard.message = editor.getValue()
				locator.entityClient.update(giftCard)
				       .then(() => dialog.close())
				       .catch(e => Dialog.error(() => "Failed to update" + e)) // TODO Translate
			}
		})

	}

	const actionButtons = [
		{
			label: () => "view giftcard", // Translate
			click: () => renderGiftCard(giftCard).then(rendered => Dialog.info(() => "giftcard", () => rendered)),
			type: ButtonType.Dropdown
		},
		{
			label: () => "edit message", // Translate
			click: () => showEditGiftCardMessageDialog(),
			type: ButtonType.Dropdown
		}
	]

	if (!giftCard.redeemedDate && getDifferenceInDays(new Date(), giftCard.orderDate) <= 14) {
		actionButtons.push({
			label: () => "refund giftcard", // Translate
			click: () => {}, // TODO,
			type: ButtonType.Dropdown
		})
	}
	const showMoreButtonAttrs = attachDropdown({
			label: () => "options",
			click: () => {},
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

export function renderGiftCard(giftCard: GiftCard): Promise<Children> {
	return generateGiftCardLink(giftCard).then(link => {

		let qrcodeGenerator = new QRCode({height: 150, width: 150, content: link})
		const qrCode = htmlSanitizer.sanitize(qrcodeGenerator.svg(), false).text

		return m(".flex-v-center", [
			m(".flex", [
				m(".b", formatPrice(parseInt(giftCard.value), true) + "€"),
				giftCard.message
			]),
			m(".flex-center", m.trust(qrCode)), // sanitized above
			m("a", { href: `mailto:?body=${link}` }, "email link to someone") // TODO Translate
		])


		// return m(".flex-v-center", [
		// 	!giftCard.redeemedDate
		// 		? m("a", {href: link}, link)
		// 		: "Gift card is redeemed", // TODO Translate
		// 	m(".pt-m", giftCard.message),
		// 	formatPrice(parseInt(giftCard.value), true)
		// ])
	})
}