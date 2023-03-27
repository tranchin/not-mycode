import { getMailFolderType, MailFolderType, MailState, ReplyType } from "../../api/common/TutanotaConstants"
import { FontIcons } from "../../gui/base/icons/FontIcons"
import type { Mail } from "../../api/entities/tutanota/TypeRefs.js"
import { formatDateTimeFromYesterdayOn } from "../../misc/Formatter"
import { getSenderOrRecipientHeading, isTutanotaTeamMail } from "../model/MailUtils"
import { locator } from "../../api/main/MainLocator"
import m, { Children } from "mithril"
import Badge from "../../gui/base/Badge"
import { px } from "../../gui/size"
import type { VirtualRow } from "../../gui/base/List"

const iconMap: Record<MailFolderType, string> = {
	[MailFolderType.CUSTOM]: FontIcons.Folder,
	[MailFolderType.INBOX]: FontIcons.Inbox,
	[MailFolderType.SENT]: FontIcons.Sent,
	[MailFolderType.TRASH]: FontIcons.Trash,
	[MailFolderType.ARCHIVE]: FontIcons.Archive,
	[MailFolderType.SPAM]: FontIcons.Spam,
	[MailFolderType.DRAFT]: FontIcons.Draft,
}

export class MailRow implements VirtualRow<Mail> {
	top: number
	domElement: HTMLElement | null = null // set from List

	entity: Mail | null = null
	private subjectDom!: HTMLElement
	private senderDom!: HTMLElement
	private dateDom!: HTMLElement
	private iconsDom!: HTMLElement
	private unreadDom!: HTMLElement
	private showFolderIcon: boolean
	private folderIconsDom: Record<MailFolderType, HTMLElement>
	private teamLabelDom!: HTMLElement

	constructor(showFolderIcon: boolean) {
		this.top = 0
		this.entity = null
		this.showFolderIcon = showFolderIcon
		this.folderIconsDom = {} as Record<MailFolderType, HTMLElement>
	}

	update(mail: Mail, selected: boolean): void {
		if (!this.domElement) {
			return
		}

		if (selected) {
			this.domElement.classList.add("row-selected")

			this.iconsDom.classList.add("secondary")
		} else {
			this.domElement.classList.remove("row-selected")

			this.iconsDom.classList.remove("secondary")
		}

		this.iconsDom.textContent = this.iconsText(mail)
		this.dateDom.textContent = formatDateTimeFromYesterdayOn(mail.receivedDate)
		this.senderDom.textContent = getSenderOrRecipientHeading(mail, true)
		this.subjectDom.textContent = mail.subject

		if (mail.unread) {
			this.unreadDom.classList.remove("hidden")

			this.subjectDom.classList.add("b")
		} else {
			this.unreadDom.classList.add("hidden")

			this.subjectDom.classList.remove("b")
		}

		if (isTutanotaTeamMail(mail)) {
			this.teamLabelDom.style.display = ""
		} else {
			this.teamLabelDom.style.display = "none"
		}
	}

	/**
	 * Only the structure is managed by mithril. We set all contents on our own (see update) in order to avoid the vdom overhead (not negligible on mobiles)
	 */
	render(): Children {
		return m(".flex", [
			m(
				".flex.items-start.flex-no-grow.no-shrink.pr-s.pb-xs",
				m(".dot.bg-accent-fg.hidden", {
					oncreate: (vnode) => (this.unreadDom = vnode.dom as HTMLElement),
				}),
			),
			m(".flex-grow.min-width-0", [
				m(".top.flex.badge-line-height", [
					m(
						Badge,
						{
							classes: ".small.mr-s",
							oncreate: (vnode) => (this.teamLabelDom = vnode.dom as HTMLElement),
						},
						"Tutanota Team",
					),
					m("small.text-ellipsis", {
						oncreate: (vnode) => (this.senderDom = vnode.dom as HTMLElement),
					}),
					m(".flex-grow"),
					m("small.text-ellipsis.flex-fixed", {
						oncreate: (vnode) => (this.dateDom = vnode.dom as HTMLElement),
					}),
				]),
				m(
					".bottom.flex-space-between",
					{
						style: {
							marginTop: px(2),
						},
					},
					[
						m(".text-ellipsis.flex-grow", {
							oncreate: (vnode) => (this.subjectDom = vnode.dom as HTMLElement),
						}),
						m("span.ion.ml-s.list-font-icons.secondary", {
							oncreate: (vnode) => (this.iconsDom = vnode.dom as HTMLElement),
						}),
					],
				),
			]),
		])
	}

	private iconsText(mail: Mail): string {
		let iconText = ""

		if (this.showFolderIcon) {
			let folder = locator.mailModel.getMailFolder(mail._id[0])
			iconText += folder ? this.folderIcon(getMailFolderType(folder)) : ""
		}

		iconText += mail._errors ? FontIcons.Warning : ""

		if (mail.state === MailState.DRAFT) {
			iconText += FontIcons.Edit
		}

		switch (mail.replyType) {
			case ReplyType.REPLY:
				iconText += FontIcons.Reply
				break

			case ReplyType.FORWARD:
				iconText += FontIcons.Forward
				break

			case ReplyType.REPLY_FORWARD:
				iconText += FontIcons.Reply
				iconText += FontIcons.Forward
				break
		}

		if (mail.confidential) {
			iconText += FontIcons.Confidential
		}

		if (mail.attachments.length > 0) {
			iconText += FontIcons.Attach
		}

		return iconText
	}

	private folderIcon(type: MailFolderType): string {
		return iconMap[type]
	}
}
