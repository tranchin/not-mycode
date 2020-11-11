// @flow

import m from "mithril"
import type {BuyOptionBoxAttr} from "../BuyOptionBox"
import {BuyOptionBox} from "../BuyOptionBox"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {formatPrice} from "../SubscriptionUtils"
import type {GiftCardBoxAttrs, GiftCardPackageEnum} from "./GiftCardUtils"
import {createGiftCardBoxAttrs, getGiftCardPackageLabel, getGiftCardPrice, GiftCardPackage} from "./GiftCardUtils"
import {neverNull} from "../../api/common/utils/Utils"


export class CreateGiftCardSelector implements MComponent<GiftCardBoxAttrs> {

	view(vnode: Vnode<GiftCardBoxAttrs>): Children {
		return [
			m(".flex.center-horizontally.wrap",
				[
					m(BuyOptionBox, createGiftCardSelectorBoxAttr(vnode.attrs, GiftCardPackage.Silver)),
					m(BuyOptionBox, createGiftCardSelectorBoxAttr(vnode.attrs, GiftCardPackage.Gold)),
					m(BuyOptionBox, createGiftCardSelectorBoxAttr(vnode.attrs, GiftCardPackage.Platinum)),
				])
		]
	}
}

function createGiftCardSelectorBoxAttr(attrs: GiftCardBoxAttrs, giftCardPackage: GiftCardPackageEnum): BuyOptionBoxAttr {
	return createGiftCardBoxAttrs(attrs, giftCardPackage, {
		view: () => m(ButtonN, {
			label: "pricing.select_action",
			click: () => {
				attrs.selectedPackage(giftCardPackage)
			},
			type: ButtonType.Login,
		})
	})
}
