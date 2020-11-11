// @flow

import m from "mithril"
import stream from "mithril/stream/stream.js"
import {downcast, neverNull} from "../../api/common/utils/Utils"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {reverse} from "../../api/common/TutanotaConstants"
import {Icons} from "../../gui/base/icons/Icons"
import type {TableLineAttrs} from "../../gui/base/TableN"
import {formatDate} from "../../misc/Formatter"
import {worker} from "../../api/main/WorkerClient"
import {CustomerInfoTypeRef} from "../../api/entities/sys/CustomerInfo"
import {CustomerTypeRef} from "../../api/entities/sys/Customer"
import {locator} from "../../api/main/MainLocator"
import type {CustomerInfo} from "../../api/entities/sys/CustomerInfo"
import type {GiftCard} from "../../api/entities/sys/GiftCard"
import {_TypeModel as GiftCardTypeModel, createGiftCard, GiftCardTypeRef} from "../../api/entities/sys/GiftCard"
import type {TranslationKey} from "../../misc/LanguageViewModel"
import {UserError} from "../../api/common/error/UserError"
import {showUserError} from "../../misc/ErrorHandlerImpl"
import {HtmlEditor, Mode} from "../../gui/base/HtmlEditor"
import type {BuyOptionBoxAttr} from "../BuyOptionBox"
import {formatPrice} from "../SubscriptionUtils"
import {BuyOptionBox} from "../BuyOptionBox"

export type GiftCardInfo = {
	giftCardId: IdTuple,
	message: string,
	packageOption: NumberString,
	country: string
}

export const GiftCardPackage =
	Object.freeze
	      ({
		      Silver: "0",
		      Gold: "1",
		      Platinum: "2"
	      })
export type GiftCardPackageEnum = $Values<typeof GiftCardPackage>

export const GiftCardPaymentStatus =
	Object.freeze({
		Pending: "0",
		Paid: "1",
	})
export type GiftCardPaymentStatusEnum = $Values<typeof GiftCardPaymentStatus>
export const ValueToGiftCardStatus: {} = reverse(GiftCardPaymentStatus)

export function getGiftCardPrice(giftCardPackage: GiftCardPackageEnum): number {
	// TODO load from the server
	return neverNull(new Map([
		[GiftCardPackage.Silver, 12],
		[GiftCardPackage.Gold, 24],
		[GiftCardPackage.Platinum, 48],
	]).get(giftCardPackage))
}

export function getGiftCardPackageLabel(option: GiftCardPackageEnum): string {
	return neverNull(new Map([
		[GiftCardPackage.Silver, "Silver"],
		[GiftCardPackage.Gold, "Gold"],
		[GiftCardPackage.Platinum, "Platinum"],
	]).get(option))
}

export function loadGiftCardInfoFromHash(hash: string): Promise<GiftCardInfo> {

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


type GiftCardEditorAttrs = {
	giftCard: GiftCard,
	readonly: boolean
}

class GiftCardEditor implements MComponent<GiftCardEditorAttrs> {
	editor: HtmlEditor
	selectedPackage: Stream<GiftCardPackageEnum>

	constructor(vnode: Vnode<GiftCardEditorAttrs>) {
		const a = vnode.attrs
		this.editor = new HtmlEditor(() => a.readonly ? "Message" : "Edit message",) // TRANSLATE
			.setMinHeight(300)
			.setMode(Mode.WYSIWYG)
			.showBorders()
			.setValue(a.giftCard.message)
			.setEnabled(!a.readonly || a.giftCard.redeemedDate !== null)

		this.selectedPackage = stream(downcast(a.giftCard.packageOption))
	}

	view(vnode: Vnode<GiftCardEditorAttrs>): Children {
		const a = vnode.attrs
		const boxAttrs = {
			selectedPackage: this.selectedPackage,
			boxWidth: 230,
			boxHeight: 250,
		}
		return m(".present-giftcard-page.pt.flex-v-center", [
			m(BuyOptionBox, createGiftCardBoxAttrs(boxAttrs, this.selectedPackage())),
			m(this.editor),
		])
	}
}

export function showGiftCardEditorDialog(giftCard: GiftCard, readonly: boolean): void {
	// TODO Add save and cancel options
	generateGiftCardLink(giftCard)
		.then(link => {
			Dialog.info(() => readonly ? "Giftcard" : "Edit giftcard", () => [ // TODO Translate
				m(GiftCardEditor, {giftCard, readonly})
			], "ok_action", DialogType.EditLarger)
		})
		.catch(UserError, showUserError)
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

	const giftCardPackage = getGiftCardPackageLabel(downcast(giftCard.packageOption))

	const statusLabel = giftCard.redeemedDate
		? `Redeemed` // TODO Translate
		: ValueToGiftCardStatus[giftCard.paymentStatus]


	console.log("package", giftCardPackage, "status", statusLabel)
	return {
		cells: [
			formatDate(giftCard.orderDate),
			giftCardPackage, //TODO clean up
			statusLabel
		],
		actionButtonAttrs: {
			label: () => "view",
			click: () => showGiftCardEditorDialog(giftCard, false),
			icon: () => Icons.Edit
		}
	}
}

export type GiftCardBoxAttrs = {
	selectedPackage: Stream<GiftCardPackageEnum>,
	boxWidth: number,
	boxHeight: number,
}

export function createGiftCardBoxAttrs(attrs: GiftCardBoxAttrs, giftCardPackage: GiftCardPackageEnum, button?: Component): BuyOptionBoxAttr {
	console.log(giftCardPackage, attrs.selectedPackage())
	const highlighted = giftCardPackage === attrs.selectedPackage()
	const giftCardPrice = getGiftCardPrice(giftCardPackage)
	console.log(giftCardPrice)
	const price = formatPrice(giftCardPrice, true)
	return {
		heading: neverNull(getGiftCardPackageLabel(giftCardPackage)),
		actionButton: button,
		price: price,
		originalPrice: price,
		helpLabel: "pricing.basePriceIncludesTaxes_msg",
		features: () => [],
		width: attrs.boxWidth,
		height: attrs.boxHeight,
		paymentInterval: null,
		highlighted: highlighted,
		showReferenceDiscount: false,
	}
}

function generateGiftCardLink(giftCard: GiftCard): Promise<string> {
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
