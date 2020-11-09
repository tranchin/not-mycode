// @flow


import m from "mithril"
import type {User} from "../api/entities/sys/User"
import {downcast, neverNull} from "../api/common/utils/Utils"
import {Dialog, DialogType} from "../gui/base/Dialog"
import {reverse} from "../api/common/TutanotaConstants"
import {Icons} from "../gui/base/icons/Icons"
import type {TableLineAttrs} from "../gui/base/TableN"
import {TypeRef} from "../api/common/EntityFunctions"
import {formatDate} from "../misc/Formatter"
import {showProgressDialog} from "../gui/base/ProgressDialog"
import {worker} from "../api/main/WorkerClient"
import {CustomerInfoTypeRef} from "../api/entities/sys/CustomerInfo"
import {load} from "../api/worker/EntityWorker"
import {CustomerTypeRef} from "../api/entities/sys/Customer"
import {locator} from "../api/main/MainLocator"
import {GiftCardsRefTypeRef} from "../api/entities/sys/GiftCardsRef"
import type {CustomerInfo} from "../api/entities/sys/CustomerInfo"
import type {GiftCard} from "../api/entities/sys/GiftCard"
import {createGiftCard, GiftCardTypeRef} from "../api/entities/sys/GiftCard"

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

export const giftCardSelectorLabels: $ReadOnlyMap<GiftCardPackageEnum, string> = new Map([
	[GiftCardPackage.Silver, "Silver"],
	[GiftCardPackage.Gold, "Gold"],
	[GiftCardPackage.Platinum, "Platinum"],
])

// TODO load from the server
export const GiftCardPackagePrices: $ReadOnlyMap<GiftCardPackageEnum, number> = new Map([
	[GiftCardPackage.Silver, 12],
	[GiftCardPackage.Gold, 24],
	[GiftCardPackage.Platinum, 48],
])

export const GiftCardStatusMessages: $ReadOnlyMap<GiftCardPaymentStatusEnum, string> = new Map([
	[GiftCardPaymentStatus.Pending, "Payment Pending"],
	[GiftCardPaymentStatus.Paid, "Paid"],
])

export function getGiftCardPrice(giftCardPackage: GiftCardPackageEnum): number {
	return neverNull(GiftCardPackagePrices.get(giftCardPackage))
}

export function getGiftCardStatusMessage(status: GiftCardPaymentStatusEnum): string {
	return neverNull(GiftCardStatusMessages.get(status))
}

export function loadGiftCardFromHash(hash: string): Promise<?GiftCard> {

	const id = hash.startsWith("#") ? hash.substr(1) : null;

	// TODO make worker call, get gift card from server

	if (!id || id === "invalid") {
		return Promise.resolve(null)
	}

	// TODO return locator.entityClient.load(GiftCardTypeRef, id)
	// return Promise.resolve({
	// 	_id: id,
	// 	package: "0",
	// 	status: "1",
	// 	message: "You got a gift card",
	// 	linkId: id,
	// 	ordered: new Date(),
	// 	redeemed: null
	// })

	return Promise.resolve(createGiftCard())
}

export function redeemGiftCard(giftCard: GiftCard): Promise<boolean> {
	return showProgressDialog("loading_msg",
		worker.redeemGiftCard(giftCard._id)
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
	Dialog.info(() => "ur giftcard", () => m(GiftCardPresentation, giftCard), "ok_action", DialogType.EditLarger)
}

export function loadGiftCards(): Promise<GiftCard[]> {
	const entityClient = locator.entityClient

	return entityClient.load(CustomerTypeRef, neverNull(this._login.getLoggedInUser().customer))
	                   .then(customer => entityClient.load(CustomerInfoTypeRef, customer.customerInfo))
	                   .then((customerInfo: CustomerInfo) => {
		                   if (customerInfo.giftCards) {
			                   return entityClient.loadAll(GiftCardTypeRef, customerInfo.giftCards._id)
		                   } else {
			                   return Promise.resolve([])
		                   }
	                   })
}

export function createGiftCardTableLine(giftCard: GiftCard): TableLineAttrs { // TODO
	return {
		cells: [formatDate(giftCard.orderDate), "TODO"],
		actionButtonAttrs: {
			label: () => "view",
			click: () => showGiftCardPresentationDialog(giftCard),
			icon: () => Icons.Eye
		}
	}
}