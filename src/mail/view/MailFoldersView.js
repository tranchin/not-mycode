// @flow

import m from "mithril"
import type {ButtonAttrs} from "../../gui/base/ButtonN"
import {ButtonColors, ButtonType} from "../../gui/base/ButtonN"
import {SidebarSection} from "../../gui/SidebarSection"
import {locator} from "../../api/main/MainLocator"
import {MailFolderRow} from "./MailFolderRow"
import {logins} from "../../api/main/LoginController"
import type {NavButtonAttrs} from "../../gui/base/NavButtonN"
import {isNavButtonSelected} from "../../gui/base/NavButtonN"
import type {MailFolder} from "../../api/entities/tutanota/MailFolder"
import {attachDropdown} from "../../gui/base/DropdownN"
import {Icons} from "../../gui/base/icons/Icons"
import type {MailboxDetail, MailFolderNode} from "../model/MailModel"
import {getFolderIcon, getFolderName, getMailboxName} from "../model/MailUtils"
import {MAIL_PREFIX} from "../../misc/RouteChange"
import {px} from "../../gui/size"

export type MailFolderRowData = {id: Id, button: NavButtonAttrs, folder: MailFolder, subfolders: Array<MailFolderRowData>}

export type MailFoldersViewAttrs = {
	mailGroupId: Id,
	detail: MailboxDetail,
	onCreateFolder: (parentFolder: MailFolder) => mixed,
	onDeleteFolder: (folder: MailFolder) => mixed,
	onEditFolder: (folder: MailFolder) => mixed,
}

export class MailFoldersView implements MComponent<MailFoldersViewAttrs> {
	view(vnode: Vnode<MailFoldersViewAttrs>): Children {
		const {detail, mailGroupId} = vnode.attrs
		return m(SidebarSection, {
				name: () => getMailboxName(logins, detail),
			},
			this.renderFolders(detail.folders, vnode.attrs),
			// this.createMailboxFolderItems(mailGroupId,
			// 	mailboxSection.systemFolderButtons,
			// 	mailboxSection.customFolderButtons,
			// 	mailboxSection.folderAddButton,
			// 	vnode.attrs)
		)
	}

	renderFolders(folders: Array<MailFolderNode>, attrs: MailFoldersViewAttrs): Children {
		return m(SidebarSection, {
			name: "yourFolders_action",
			buttonAttrs: null,
			key: "yourFolders" // we need to set a key because folder rows also have a key.
		}, folders.map(f => this._renderFolder(f, 0, attrs)))
	}

	_renderFolder(folder: MailFolderNode, nestingLevel: number, attrs: MailFoldersViewAttrs): Children {
		const button = {
			label: () => getFolderName(folder.folder),
			icon: getFolderIcon(folder.folder),
			href: () => `/mail/${folder.folder.mails}`, // "this._folderToUrl[folder._id[1]]",
			isSelectedPrefix: MAIL_PREFIX + "/" + folder.folder.mails,
			colors: ButtonColors.Nav,
			click: () => {}, //this.viewSlider.focus(this.listColumn),
			dropHandler: (droppedMailId) => {
				// TODO
				// let mailsToMove = []
				// // the dropped mail is among the selected mails, move all selected mails
				// if (this.mailList.list.isEntitySelected(droppedMailId)) {
				// 	mailsToMove = this.mailList.list.getSelectedEntities()
				// } else {
				// 	let entity = this.mailList.list.getEntity(droppedMailId)
				// 	if (entity) {
				// 		mailsToMove.push(entity)
				// 	}
				// }
				// moveMails(locator.mailModel, mailsToMove, folder)
			}
		}

		return m("", {
				style: {
					marginLeft: px(nestingLevel * 10)
				}
			}, [
				m(MailFolderRow, {
					count: 0,
					button: button,
					//rightButton: null,
					rightButton: isNavButtonSelected(button)
						? this.createFolderMoreButton(folder.folder, attrs)
						: null,
					key: null, //folder.folder._id[1]
				}),
				folder.subfolders.map(f => this._renderFolder(f, nestingLevel + 1, attrs)),
			]
		)
	}

	createMailboxFolderItems(mailGroupId: Id,
	                         systemFolderButtons: MailFolderRowData[],
	                         customFolderButtons: MailFolderRowData[],
	                         folderAddButton: ButtonAttrs,
	                         attrs: MailFoldersViewAttrs): Children {
		const groupCounters = locator.mailModel.mailboxCounters()[mailGroupId] || {}
		return systemFolderButtons.map(({id, button}) => {
			const count = groupCounters[id]
			return m(MailFolderRow, {
				count: count,
				button,
				rightButton: null,
				key: id,
			})
		}).concat(logins.isInternalUserLoggedIn()
			? m(SidebarSection, {
					name: "yourFolders_action",
					buttonAttrs: folderAddButton,
					key: "yourFolders" // we need to set a key because folder rows also have a key.
				},
				customFolderButtons.map(({id, button, folder}) => {
					const count = groupCounters[id]
					return m(MailFolderRow, {
						count,
						button,
						rightButton: isNavButtonSelected(button)
							? this.createFolderMoreButton(folder, attrs)
							: null,
						key: id
					})
				})
			)
			: []
		)
	}

	createFolderMoreButton(folder: MailFolder, attrs: MailFoldersViewAttrs): ButtonAttrs {
		return attachDropdown({
			label: "more_label",
			icon: () => Icons.More,
			colors: ButtonColors.Nav
		}, () => [
			{
				label: "rename_action",
				icon: () => Icons.Edit,
				type: ButtonType.Dropdown,
				click: () => {
					attrs.onEditFolder(folder)
				}
			},
			{
				label: "delete_action",
				icon: () => Icons.Trash,
				type: ButtonType.Dropdown,
				click: () => {
					attrs.onDeleteFolder(folder)
				}
			},
			{
				label: "folderNameCreate_label",
				icon: () => Icons.Add,
				type: ButtonType.Dropdown,
				click: () => {
					attrs.onCreateFolder(folder)
				}
			}
		])
	}

	createFolderButtons(folders: Array<MailFolderNode>): MailFolderRowData[] {
		// TODO
		return []
		// return folders.map(folder => {
		// 	this._folderToUrl[folder._id[1]] = `/mail/${folder.mails}`
		// 	const button = {
		// 		label: () => getFolderName(folder),
		// 		icon: getFolderIcon(folder),
		// 		href: () => this._folderToUrl[folder._id[1]],
		// 		isSelectedPrefix: MAIL_PREFIX + "/" + folder.mails,
		// 		colors: ButtonColors.Nav,
		// 		click: () => this.viewSlider.focus(this.listColumn),
		// 		dropHandler: (droppedMailId) => {
		// 			let mailsToMove = []
		// 			// the dropped mail is among the selected mails, move all selected mails
		// 			if (this.mailList.list.isEntitySelected(droppedMailId)) {
		// 				mailsToMove = this.mailList.list.getSelectedEntities()
		// 			} else {
		// 				let entity = this.mailList.list.getEntity(droppedMailId)
		// 				if (entity) {
		// 					mailsToMove.push(entity)
		// 				}
		// 			}
		// 			moveMails(locator.mailModel, mailsToMove, folder)
		// 		}
		// 	}
		//
		// 	return {id: folder.mails, button, folder, subfolders}
		// })
	}

	// createMailboxSection(mailboxDetail: MailboxDetail): MailboxSection {
	// 	// TODO
	// 	return {}
	// 	// const mailGroupId = mailboxDetail.mailGroup._id
	// 	// return {
	// 	// 	details: mailboxDetail,
	// 	// 	label: () => getMailboxName(logins, mailboxDetail),
	// 	// 	systemFolderButtons: this.createFolderButtons(getSortedSystemFolders(mailboxDetail.folders)),
	// 	// 	customFolderButtons: this.createFolderButtons(getSortedCustomFolders(mailboxDetail.folders)),
	// 	// 	folderAddButton: this.createFolderAddButton(mailGroupId),
	// 	// 	counter: null
	// 	// }
	// }


}

