import m, { Children, Component, Vnode } from "mithril"
import { incrementDate, lastThrow, neverNull } from "@tutao/tutanota-utils"
import { lang } from "../../misc/LanguageViewModel"
import { formatDate, formatDateWithWeekday } from "../../misc/Formatter"
import { getEventColor, getStartOfDayWithZone, getTimeZone } from "../date/CalendarUtils"
import { isAllDayEvent } from "../../api/common/utils/CommonCalendarUtils"
import type { CalendarEvent } from "../../api/entities/tutanota/TypeRefs.js"
import type { GroupColors } from "./CalendarView"
import type { CalendarEventBubbleClickHandler } from "./CalendarViewModel"
import { getNextFourteenDays } from "./CalendarGuiUtils.js"
import { styles } from "../../gui/styles.js"
import { CalendarAgendaItemView } from "./CalendarAgendaItemView.js"

type Attrs = {
	selectedDate: Date
	/**
	 * maps start of day timestamp to events on that day
	 */
	eventsForDays: Map<number, Array<CalendarEvent>>
	amPmFormat: boolean
	onEventClicked: CalendarEventBubbleClickHandler
	groupColors: GroupColors
	hiddenCalendars: ReadonlySet<Id>
	onDateSelected: (date: Date) => unknown
}

export class CalendarAgendaView implements Component<Attrs> {
	view({ attrs }: Vnode<Attrs>): Children {
		return m(".fill-absolute.flex.col.mlr-safe-inset.content-bg", [
			m(".mt-s.pr-l"),
			styles.isUsingBottomNavigation() ? this.renderAgendaForDay(attrs) : this.renderAgendaForDateRange(attrs),
		])
	}

	private renderAgendaForDay(attrs: Attrs): Children {
		const events = (attrs.eventsForDays.get(attrs.selectedDate.getTime()) || []).filter((e) => !attrs.hiddenCalendars.has(neverNull(e._ownerGroup)))
		return m(
			".scroll.pt-s.flex.mlr.calendar-agenda-row.mb-s.col",
			this.renderEventsForDay(events, attrs.selectedDate, getTimeZone(), attrs.groupColors, attrs.onEventClicked),
		)
	}

	private renderAgendaForDateRange(attrs: Attrs): Children {
		const now = new Date()
		const zone = getTimeZone()
		const today = getStartOfDayWithZone(now, zone)
		const tomorrow = incrementDate(new Date(today), 1)
		const days = getNextFourteenDays(today)
		const lastDay = lastThrow(days)

		const lastDayFormatted = formatDate(lastDay)
		return m(
			".scroll.pt-s",
			days
				.map((day: Date) => {
					let events = (attrs.eventsForDays.get(day.getTime()) || []).filter((e) => !attrs.hiddenCalendars.has(neverNull(e._ownerGroup)))

					if (day === today) {
						// only show future and currently running events
						events = events.filter((ev) => isAllDayEvent(ev) || now < ev.endTime)
					} else if (day.getTime() > tomorrow.getTime() && events.length === 0) {
						return null
					}

					const dateDescription =
						day.getTime() === today.getTime()
							? lang.get("today_label")
							: day.getTime() === tomorrow.getTime()
							? lang.get("tomorrow_label")
							: formatDateWithWeekday(day)
					return m(
						".flex.mlr-l.calendar-agenda-row.mb-s.col",
						{
							key: day.getTime(),
						},
						[
							m(
								"button.pb-s.b",
								{
									onclick: () => attrs.onDateSelected(new Date(day)),
								},
								dateDescription,
							),
							m(
								".flex-grow",
								{
									style: {
										"max-width": "600px",
									},
								},
								this.renderEventsForDay(events, day, zone, attrs.groupColors, attrs.onEventClicked),
							),
						],
					)
				})
				.filter(Boolean) // mithril doesn't allow mixing keyed elements with null (for perf reasons it seems)
				.concat(
					m(
						".mlr-l",
						{
							key: "events_until",
						},
						lang.get("showingEventsUntil_msg", {
							"{untilDay}": lastDayFormatted,
						}),
					),
				),
		)
	}

	private renderEventsForDay(
		events: CalendarEvent[],
		day: Date,
		zone: string,
		colors: GroupColors,
		click: (event: CalendarEvent, domEvent: MouseEvent) => unknown,
	) {
		return events.length === 0
			? m(".mb-s", lang.get("noEntries_msg"))
			: m(
					".flex.col",
					{
						style: {
							gap: "3px",
						},
					},
					events.map((event) => {
						return m(
							"",
							{
								key: event._id.toString(),
							},
							m(CalendarAgendaItemView, {
								event: event,
								color: getEventColor(event, colors),
								click: (domEvent) => click(event, domEvent),
								zone,
								day: day,
							}),
						)
					}),
			  )
	}
}
