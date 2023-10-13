import { Dialog } from "../../gui/base/Dialog"
import m, { Children } from "mithril"
import stream from "mithril/stream"
import { TextField } from "../../gui/base/TextField.js"
import { lang } from "../../misc/LanguageViewModel"
import type { TranslationKeyType } from "../../misc/TranslationKey"
import { downcast } from "@tutao/tutanota-utils"
import { DropDownSelector, DropDownSelectorAttrs } from "../../gui/base/DropDownSelector.js"
import { AlarmInterval, createAlarmIntervalItems, parseAlarmInterval, serializeAlarmInterval } from "../date/CalendarUtils.js"

type CalendarProperties = {
	name: string
	color: string
	defaultAlarm: AlarmInterval | null
}

export function showEditCalendarDialog(
	{ name, color, defaultAlarm }: CalendarProperties,
	titleTextId: TranslationKeyType,
	shared: boolean,
	okAction: (arg0: Dialog, arg1: CalendarProperties) => unknown,
	okTextId: TranslationKeyType,
	warningMessage?: () => Children,
) {
	const nameStream = stream(name)
	let colorPickerDom: HTMLInputElement | null
	const colorStream = stream("#" + color)
	let defaultCalendarReminder: string | null = defaultAlarm ? serializeAlarmInterval(defaultAlarm) : null
	const defaultAlarmItems = createAlarmIntervalItems(lang.languageTag).map(({ name, value }) => ({
		name,
		value: serializeAlarmInterval(value),
	}))
	Dialog.showActionDialog({
		title: () => lang.get(titleTextId),
		allowOkWithReturn: true,
		child: {
			view: () =>
				m(".flex.col", [
					warningMessage ? warningMessage() : null,
					m(TextField, {
						value: nameStream(),
						oninput: nameStream,
						label: "calendarName_label",
					}),
					m(".small.mt.mb-xs", lang.get("color_label")),
					m("input.color-picker", {
						oncreate: ({ dom }) => (colorPickerDom = downcast<HTMLInputElement>(dom)),
						type: "color",
						value: colorStream(),
						oninput: (inputEvent: InputEvent) => {
							const target = inputEvent.target as HTMLInputElement
							colorStream(target.value)
						},
					}),
					m(DropDownSelector, {
						label: () => "Default reminder",
						items: [{ name: "none", value: null }, ...defaultAlarmItems],
						selectedValue: defaultCalendarReminder,
						selectionChangedHandler: (value) => {
							defaultCalendarReminder = value
						},
					} satisfies DropDownSelectorAttrs<string | null>),
				]),
		},
		okActionTextId: okTextId,
		okAction: (dialog: Dialog) => {
			okAction(dialog, {
				name: nameStream(),
				color: colorStream().substring(1),
				defaultAlarm: defaultCalendarReminder ? parseAlarmInterval(defaultCalendarReminder) : null,
			})
		},
	})
}
