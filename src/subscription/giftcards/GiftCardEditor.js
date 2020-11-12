// @flow

import stream from "mithril/stream/stream.js"
import m from "mithril"
import type {GiftCard} from "../../api/entities/sys/GiftCard"
import {HtmlEditor, Mode} from "../../gui/base/HtmlEditor"
import {downcast, neverNull} from "../../api/common/utils/Utils"
import {BuyOptionBox} from "../BuyOptionBox"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {UserError} from "../../api/common/error/UserError"
import {showUserError} from "../../misc/ErrorHandlerImpl"
import {generateGiftCardLink} from "./GiftCardUtils"
import {getByAbbreviation} from "../../api/common/CountryList"
import type {Country} from "../../api/common/CountryList"
import type {ModalComponent} from "../../gui/base/Modal"

type GiftCardEditorAttrs = {
	giftCard: GiftCard,
	readonly: boolean
}

function renderGiftCard(giftCard: GiftCard) : Children {
	return []
}

class GiftCardEditor implements MComponent<GiftCardEditorAttrs> {
	editor: HtmlEditor
	value: Stream<number>

	constructor(vnode: Vnode<GiftCardEditorAttrs>) {
		const a = vnode.attrs
		this.editor = new HtmlEditor(() => a.readonly ? "Message" : "Edit message",) // TRANSLATE
			.setMinHeight(300)
			.setMode(Mode.WYSIWYG)
			.showBorders()
			.setValue(a.giftCard.message)
			.setEnabled(!a.readonly || a.giftCard.redeemedDate !== null)

		this.value = stream(downcast(a.giftCard.value))
	}

	view(vnode: Vnode<GiftCardEditorAttrs>): Children {
		return []
		// const a = vnode.attrs
		// const boxAttrs = {
		// 	selectedPackage: this.selectedPackage,
		// 	boxWidth: 230,
		// 	boxHeight: 250,
		// }
		// const country: Country = neverNull(getByAbbreviation(a.giftCard.country))
		// return m(".present-giftcard-page.pt.flex-v-center", [
		// 	m(".flex", [
		// 		m(BuyOptionBox, createGiftCardBoxAttrs(boxAttrs, this.selectedPackage())),
		// 		m(this.editor),
		// 	]),
		// 	`Valid in ${country.n}`,
		// ])
	}
}

export function showGiftCardEditorDialog(giftCard: GiftCard, readonly: boolean): void {
	// TODO Add save and cancel options
	generateGiftCardLink(giftCard)
		.then(link => {
			Dialog.info(() => readonly ? "Giftcard" : "Edit giftcard", () => [ // TODO Translate
				m('a', {href: link}, link),
				m(GiftCardEditor, {giftCard, readonly})
			], "ok_action", DialogType.EditLarger)
		})
		.catch(UserError, showUserError)
}
