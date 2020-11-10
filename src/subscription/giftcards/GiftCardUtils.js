// @flow

import m from "mithril"
import {downcast, neverNull} from "../../api/common/utils/Utils"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {reverse} from "../../api/common/TutanotaConstants"
import {Icons} from "../../gui/base/icons/Icons"
import type {TableLineAttrs} from "../../gui/base/TableN"
import {formatDate} from "../../misc/Formatter"
import {showProgressDialog} from "../../gui/base/ProgressDialog"
import {worker} from "../../api/main/WorkerClient"
import {CustomerInfoTypeRef} from "../../api/entities/sys/CustomerInfo"
import {CustomerTypeRef} from "../../api/entities/sys/Customer"
import {locator} from "../../api/main/MainLocator"
import type {CustomerInfo} from "../../api/entities/sys/CustomerInfo"
import type {GiftCard} from "../../api/entities/sys/GiftCard"
import {_TypeModel as GiftCardTypeModel, createGiftCard, GiftCardTypeRef} from "../../api/entities/sys/GiftCard"
import type {TranslationKey} from "../../misc/LanguageViewModel"
import {UserError} from "../../api/common/error/UserError"

export type GiftCardInfo = {
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
export const ValueToGiftCardPackage: {} = reverse(GiftCardPackage)

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

export function loadGiftCardInfoFromHash(hash: string): Promise<GiftCardInfo> { // TODO type

	const encodedToken = hash.startsWith("#") ? hash.substr(1) : null;

	if (!encodedToken) {
		throw new UserError(() => "Invalid gift card link") // TODO Throw UserError
	}

	const {id, key} = _resolveToken(encodedToken)

	// TODO make worker call, get gift card from server
	return worker.initialized.then(() => {
		return worker.getGiftCardInfo(id, key)
	})

}

export function redeemGiftCard(giftCardInfo: GiftCardInfo): Promise<boolean> {
	return showProgressDialog("loading_msg",
		// worker.redeemGiftCard(giftCard._id)
		Promise.resolve(false)
	)
}


// TODO
class GiftCardPresentation implements MComponent<GiftCard> {
	view(vnode: Vnode<GiftCard>): Children {
		const giftCard = vnode.attrs
		return m(".present-giftcard-page.pt", [
			m("span", {
				style: {
					// fontSize: "0.5rem"
				}
			}, JSON.stringify(giftCard, null, 4))
		])
	}
}

export function showGiftCardPresentationDialog(giftCard: GiftCard): void {
	generateGiftCardLink(giftCard).then(link => {
		const message = giftCard.message
		const packageOption = giftCard.packageOption
		Dialog.info(() => "ur giftcard", () => [m("", link), m(GiftCardPresentation, giftCard)], "ok_action", DialogType.EditLarger)
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

	const giftCardPackage = ValueToGiftCardPackage[giftCard.packageOption]
	const statusLabel = ValueToGiftCardStatus[giftCard.paymentStatus]
	console.log("package", giftCardPackage, "status", statusLabel)
	return {
		cells: [
			formatDate(giftCard.orderDate),
			giftCardPackage, //TODO clean up
			statusLabel
		],
		actionButtonAttrs: {
			label: () => "view",
			click: () => showGiftCardPresentationDialog(giftCard),
			icon: () => Icons.Eye
		}
	}
}

function resolveGiftCardLink(token: Base64) {

}

function generateGiftCardLink(giftCard: GiftCard): Promise<?string> {
	return worker.resolveSessionKey(GiftCardTypeModel, giftCard).then(key => {
		return key
			? `https://tutanota.com/giftcard/#${_generateToken(giftCard._id, key)}`
			: null
	})
}

function _generateToken(id: IdTuple, key: string): Base64 {
	const tokenJSON = JSON.stringify({
		id,
		key
	})
	return btoa(tokenJSON) // TODO maybe this is breakable????

}

function _resolveToken(token: Base64): {
	id: IdTuple,
	key: string
} {
	const tokenJSON = atob(token)
	return JSON.parse(tokenJSON)

}
