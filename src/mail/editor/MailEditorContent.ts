import m, {Children, Component, Vnode} from "mithril"
import {Dialog} from "../../gui/base/Dialog.js"
import {TemplatePopupModel} from "../../templates/model/TemplatePopupModel.js"
import {ButtonAttrs, ButtonColor, ButtonN, ButtonType} from "../../gui/base/ButtonN.js"
import {RecipientsSearchModel} from "../../misc/RecipientsSearchModel.js"
import {MailEditorViewModel} from "./MailEditorViewModel.js"
import {Icons} from "../../gui/base/icons/Icons.js"
import {logins} from "../../api/main/LoginController.js"
import {TextFieldN, TextFieldType} from "../../gui/base/TextFieldN.js"
import {attachDropdown, createDropdown, DropdownChildAttrs} from "../../gui/base/DropdownN.js"
import {createNewContact, RecipientField} from "../model/MailUtils.js"
import {ExpanderButtonN, ExpanderPanelN} from "../../gui/base/Expander.js"
import {DropDownSelectorN} from "../../gui/base/DropDownSelectorN.js"
import {animations, height, opacity} from "../../gui/animation/Animations.js"
import {lang} from "../../misc/LanguageViewModel.js"
import {RecipientType} from "../../api/common/recipients/Recipient.js"
import {CompletenessIndicator} from "../../gui/CompletenessIndicator.js"
import {MailRecipientsTextField} from "../../gui/MailRecipientsTextField.js"
import {isOfflineError} from "../../api/common/utils/ErrorCheckUtils.js"
import {TooManyRequestsError} from "../../api/common/error/RestError.js"
import {ResolvableRecipient} from "../../api/main/RecipientsModel.js"
import {ALLOWED_IMAGE_FORMATS, ConversationType, FeatureType, Keys} from "../../api/common/TutanotaConstants.js"
import {ContactTypeRef} from "../../api/entities/tutanota/TypeRefs.js"
import {cleanMatch, downcast, mapNullable, noOp, ofClass} from "@tutao/tutanota-utils"
import {getContactDisplayName} from "../../contacts/model/ContactUtils.js"
import {formatStorageSize} from "../../misc/Formatter.js"
import {Attachment} from "./SendMailModel.js"
import {UserError} from "../../api/main/UserError.js"
import {showUserError} from "../../misc/ErrorHandlerImpl.js"
import {RichTextToolbar} from "../../gui/base/RichTextToolbar.js"
import {isApp, Mode} from "../../api/common/Env.js"
import {FileReference, isDataFile} from "../../api/common/utils/FileUtils.js"
import {DataFile} from "../../api/common/DataFile.js"
import {showTemplatePopupInEditor} from "../../templates/view/TemplatePopup.js"
import {createKnowledgeBaseDialogInjection} from "../../knowledgebase/view/KnowledgeBaseDialog.js"
import {DialogInjectionRightAttrs} from "../../gui/base/DialogInjectionRight.js"
import {KnowledgebaseDialogContentAttrs} from "../../knowledgebase/view/KnowledgeBaseDialogContent.js"
import {replaceCidsWithInlineImages} from "../view/MailGuiUtils.js"
import {Shortcut} from "../../misc/KeyManager.js"
import {PermissionError} from "../../api/common/error/PermissionError.js"
import {FileNotFoundError} from "../../api/common/error/FileNotFoundError.js"
import {registerTemplateShortcutListener} from "../../templates/view/TemplateShortcutListener.js"


export interface MailEditorContentAttrs {
	model: MailEditorViewModel
	search: RecipientsSearchModel
	templatePopupModel: TemplatePopupModel | null
	parentDialog: Dialog
}

export class MailEditorContent implements Component<MailEditorContentAttrs> {
	private toolbar: RichTextToolbar
	private areDetailsExpanded = false
	private knowledgeBaseDialogInjectionAttrs: DialogInjectionRightAttrs<KnowledgebaseDialogContentAttrs> | null = null

	constructor({attrs}: Vnode<MailEditorContentAttrs>) {
		const {
			model,
			templatePopupModel,
			parentDialog
		} = attrs

		this.toolbar = new RichTextToolbar(model.editor, {
			imageButtonClickHandler: isApp()
				? null
				: async (event: Event) => {
					const files = await this.chooseAndAttachFile(model, (event.target as HTMLElement).getBoundingClientRect(), ALLOWED_IMAGE_FORMATS)
					for (const file of files.filter(isDataFile)) {
						model.attachInlineImage(file)
					}
					m.redraw()
				},
			customButtonAttrs: templatePopupModel
				? [
					{
						label: "emptyString_msg",
						title: "openTemplatePopup_msg",
						click: () => {
							if (templatePopupModel) {
								openTemplates(model, templatePopupModel)
							}
						},
						type: ButtonType.Toggle,
						icon: () => Icons.ListAlt,
					},
				]
				: [],
		})

		model.initialized.then(() => {
			model.inlineImageElements = replaceCidsWithInlineImages(model.editor.getDOM(), model.loadedInlineImages, (cid, event, dom) => {
				const downloadClickHandler = createDropdown({
					lazyButtons: () => [
						{
							label: "download_action",
							click: () => model.downloadInlineImage(cid).catch(ofClass(UserError, showUserError)),
							type: ButtonType.Dropdown,
						},
					]
				})
				downloadClickHandler(downcast(event), dom)
			})

			if (templatePopupModel) {
				templatePopupModel.init().then(templateModel => {
					// add this event listener to handle quick selection of templates inside the editor
					registerTemplateShortcutListener(model.editor, templateModel)
				})

				model.loadKnowledgeBaseModel().then(knowledgeBase => {
					if (knowledgeBase) {
						this.knowledgeBaseDialogInjectionAttrs = createKnowledgeBaseDialogInjection(knowledgeBase, templatePopupModel, model.editor)
						parentDialog.setInjectionRight(this.knowledgeBaseDialogInjectionAttrs)
					}
					m.redraw()
				})
			}

			if (model.getConversationType() === ConversationType.REPLY || model.toRecipients().length) {
				parentDialog.setFocusOnLoadFunction(() => model.editor.focus())
			}
		})

		model.onChanged.map(didChange => {
			if (didChange) m.redraw()
		})

		const shortcuts: Shortcut[] = [
			{
				key: Keys.SPACE,
				ctrl: true,
				exec: () => {
					if (templatePopupModel) {
						openTemplates(model, templatePopupModel)
					}
				},
				help: "openTemplatePopup_msg",
			},
			// these are handled by squire
			{
				key: Keys.B,
				ctrl: true,
				exec: noOp,
				help: "formatTextBold_msg",
			},
			{
				key: Keys.I,
				ctrl: true,
				exec: noOp,
				help: "formatTextItalic_msg",
			},
			{
				key: Keys.U,
				ctrl: true,
				exec: noOp,
				help: "formatTextUnderline_msg",
			},
		]
		for (const shortcut of shortcuts) {
			parentDialog.addShortcut(shortcut)
		}
	}

	view({attrs}: Vnode<MailEditorContentAttrs>): Children {
		const {model, search} = attrs

		return m("#mail-editor.full-height.text.touch-callout.flex.flex-column",
			{
				onclick: (e: MouseEvent) => {
					if (e.target === model.editor.getDOM()) {
						model.editor.focus()
					}
				},
				ondragover: (ev: DragEvent) => {
					// do not check the data transfer here because it is not always filled, e.g. in Safari
					ev.stopPropagation()
					ev.preventDefault()
				},
				ondrop: (ev: DragEvent) => {
					if (ev.dataTransfer?.files && ev.dataTransfer.files.length > 0) {
						model.fileController.readLocalFiles(ev.dataTransfer.files)
							   .then(dataFiles => {
								   model.attachFiles(dataFiles as any)
								   m.redraw()
							   })
							   .catch(e => {
								   console.log(e)
								   return Dialog.message("couldNotAttachFile_msg")
							   })
						ev.stopPropagation()
						ev.preventDefault()
					}
				},
			},
			[
				this.renderRecipientsSection(model, search),
				m(".wrapping-row", [
					this.renderSenderSection(model),
					model.containsConfidentialExternalRecipients()
						? this.renderNotificationMailSection(model)
						: null,
				]),
				model.containsConfidentialExternalRecipients()
					? this.renderPasswordFields(model)
					: null,
				this.renderSubjectField(model),
				m(".flex-start.flex-wrap.ml-negative-RecipientInfoBubble",
					model.getAttachments().map(file => this.renderAttachmentButton(model, file))
				),
				model.getAttachments().length > 0 ? m("hr.hr") : null,
				model.doShowToolbar()
					? this.renderToolbar()
					: null,
				m(".pt-s.text.scroll-x.break-word-links.flex.flex-column.flex-grow",
					{
						onclick: () => model.editor.focus(),
					},
					m(model.editor)
				),
				m(".pb"),
			],
		)
	}

	private renderSenderSection(model: MailEditorViewModel): Children {
		return m("",
			{
				style: {
					"min-width": "250px",
				},
			},
			m(DropDownSelectorN, {
				label: "sender_label",
				items: model.getEnabledMailAddresses().map(mailAddress => ({
					name: mailAddress,
					value: mailAddress,
				})),
				selectedValue: model.getSender(),
				selectionChangedHandler: (selection: string) => model.setSender(selection),
				dropdownWidth: 250,
			}),
		)
	}

	private renderNotificationMailSection(model: MailEditorViewModel): Children {
		return m(".flex", {
				style: {
					"min-width": "250px",
				},
				oncreate: vnode => {
					const htmlDom = vnode.dom as HTMLElement
					htmlDom.style.opacity = "0"
					return animations.add(htmlDom, opacity(0, 1, true))
				},
				onbeforeremove: vnode => {
					const htmlDom = vnode.dom as HTMLElement
					htmlDom.style.opacity = "1"
					return animations.add(htmlDom, opacity(1, 0, true))
				},
			},
			[
				m(".flex-grow", m(DropDownSelectorN, {
					label: "notificationMailLanguage_label",
					items: model.getAvailableNotificationTemplateLanguages().map(language => {
						return {
							name: lang.get(language.textId),
							value: language.code,
						}
					}),
					selectedValue: model.getSelectedNotificationLanguageCode(),
					selectionChangedHandler: (v: string) => model.setSelectedNotificationLanguageCode(v),
					dropdownWidth: 250,
				})),
				model.userController.isGlobalAdmin()
					? m(".flex-no-grow.col.flex-end.border-bottom",
						m(".mr-negative-s",
							m(ButtonN, attachDropdown({
								mainButtonAttrs: {
									label: "edit_action",
									click: () => {
									},
									icon: () => Icons.Edit,
								}, childAttrs: () => [
									{
										label: "add_action",
										click: () => {
											import("../../settings/EditNotificationEmailDialog").then(({showAddOrEditNotificationEmailDialog}) =>
												showAddOrEditNotificationEmailDialog(model.userController),
											)
										},
										type: ButtonType.Dropdown,
									},
									{
										label: "edit_action",
										click: () => {
											import("../../settings/EditNotificationEmailDialog").then(({showAddOrEditNotificationEmailDialog}) =>
												showAddOrEditNotificationEmailDialog(model.userController, model.getSelectedNotificationLanguageCode()),
											)
										},
										type: ButtonType.Dropdown,
									},
								]
							}))
						)
					)
					: null,
			])
	}

	private renderSubjectField(model: MailEditorViewModel): Children {
		return m(".row", m(TextFieldN, {
			label: "subject_label",
			helpLabel: () => model.isConfidential() ? lang.get("confidentialStatus_msg") : lang.get("nonConfidentialStatus_msg"),
			value: model.getSubject(),
			oninput: val => model.setSubject(val),
			injectionsRight: () => {
				return [
					model.containsExternalRecipients()
						? m(ButtonN, {
							label: "confidential_action",
							click: () => model.toggleConfidential(),
							icon: () => (model.isConfidential() ? Icons.Lock : Icons.Unlock),
							isSelected: () => model.isConfidential(),
						})
						: null,
					mapNullable(this.knowledgeBaseDialogInjectionAttrs, attrs => m(ButtonN, {
						label: "openKnowledgebase_action",
						click: () => {
							if (attrs.visible()) {
								attrs.visible(false)
							} else {
								attrs.componentAttrs.model.sortEntriesByMatchingKeywords(model.editor.getValue())
								attrs.visible(true)
								attrs.componentAttrs.model.init()
							}
						},
						icon: () => Icons.Book,
						isSelected: attrs.visible,
					})),
					m(ButtonN, {
						label: "attachFiles_action",
						click: (ev, dom) => this.chooseAndAttachFile(model, dom.getBoundingClientRect()),
						icon: () => Icons.Attachment,
					}),
					!model.usePlainTextFormatting()
						? m(ButtonN, {
							label: "showRichTextToolbar_action",
							icon: () => Icons.FontSize,
							click: event => {
								model.toggleShowToolbar()
								// Stop the subject bar from being focused
								event.stopPropagation()
								model.editor.focus()
							},
							isSelected: () => model.doShowToolbar(),
							noRecipientInfoBubble: true,
						} as ButtonAttrs)
						: null,
				]
			},
		}))
	}

	private async chooseAndAttachFile(model: MailEditorViewModel, boundingRect: ClientRect, fileTypes?: Array<string>): Promise<ReadonlyArray<DataFile | FileReference>> {
		boundingRect.height = Math.round(boundingRect.height)
		boundingRect.width = Math.round(boundingRect.width)
		boundingRect.x = Math.round(boundingRect.x)
		boundingRect.y = Math.round(boundingRect.y)

		let files: Array<FileReference | DataFile> = []
		try {
			files = env.mode === Mode.App
				? await model.fileApp().openFileChooser(boundingRect)
				: await model.fileController.showFileChooser(true, fileTypes)

			await model.attachFiles(files)
		} catch (e) {
			if (e instanceof PermissionError) {
				Dialog.message("fileAccessDeniedMobile_msg")
			} else if (e instanceof FileNotFoundError) {
				Dialog.message("couldNotAttachFile_msg")
			} else if (e instanceof UserError) {
				showUserError(e)
			} else {
				throw e
			}
		}
		return files
	}

	private renderToolbar(): Children {
		// Toolbar is not removed from DOM directly, only it's parent (array) is so we have to animate it manually.
		// m.fragment() gives us a vnode without actual DOM element so that we can run callback on removal
		return m.fragment(
			{
				onbeforeremove: ({dom}) => this.toolbar._animate(dom.children[0] as HTMLElement, false),
			},
			[m(this.toolbar), m("hr.hr")],
		)
	}

	private renderRecipientsSection(model: MailEditorViewModel, search: RecipientsSearchModel): Children {
		return [
			m(".rel", this.renderRecipientField(RecipientField.TO, model.toFieldText, text => model.toFieldText = text, model, search)),
			m(".rel",
				m(ExpanderPanelN, {
						expanded: this.areDetailsExpanded,
					},
					m(".details", [
						this.renderRecipientField(RecipientField.CC, model.ccFieldText, text => model.ccFieldText = text, model, search),
						this.renderRecipientField(RecipientField.BCC, model.bccFieldText, text => model.bccFieldText = text, model, search)
					]),
				),
			)
		]
	}

	private renderPasswordFields(model: MailEditorViewModel): Children {
		return m(".external-recipients.overflow-hidden",
			{
				oncreate: vnode => animateHeight(vnode.dom as HTMLElement, true),
				onbeforeremove: vnode => animateHeight(vnode.dom as HTMLElement, false),
			},
			model
				.allRecipients()
				.filter(r => r.type === RecipientType.EXTERNAL || (r.type === RecipientType.UNKNOWN && !r.isResolved())) // only show passwords for resolved contacts, otherwise we might not get the password
				.map(recipient => {
					return m(TextFieldN, {
						oncreate: vnode => animateHeight(vnode.dom as HTMLElement, true),
						onbeforeremove: vnode => animateHeight(vnode.dom as HTMLElement, false),
						label: () => lang.get("passwordFor_label", {"{1}": recipient.address,}),
						helpLabel: () => m(CompletenessIndicator, {percentageCompleted: model.getPasswordStrength(recipient)}),
						value: model.getPassword(recipient.address),
						type: TextFieldType.ExternalPassword,
						oninput: val => model.setPassword(recipient.address, val),
					})
				})
		)
	}

	private renderRecipientField(
		field: RecipientField,
		text: string,
		onTextChanged: (text: string) => void,
		model: MailEditorViewModel,
		search: RecipientsSearchModel,
	): Children {

		const label = ({
			to: "to_label",
			cc: "cc_label",
			bcc: "bcc_label"
		} as const)[field]

		return m(MailRecipientsTextField, {
			label,
			text: text,
			onTextChanged: onTextChanged,
			recipients: model.getRecipientList(field),
			onRecipientAdded: async (address, name) => {
				try {
					await model.addRecipient(field, {address, name})
				} catch (e) {
					if (isOfflineError(e)) {
						// we are offline but we want to show the error dialog only when we click on send.
					} else if (e instanceof TooManyRequestsError) {
						await Dialog.message("tooManyAttempts_msg")
					} else {
						throw e
					}
				}
			},
			onRecipientRemoved: address => model.removeRecipientByAddress(address, field),
			getRecipientClickedDropdownAttrs: (address) => {
				const recipient = model.getRecipient(field, address)!
				return this.getRecipientClickedContextButtons(model, recipient, field)
			},
			disabled: !model.isInternalUserLoggedIn(),
			injectionsRight: field === RecipientField.TO && model.isInternalUserLoggedIn()
				? m(
					".mr-s",
					m(ExpanderButtonN, {
						label: "show_action",
						expanded: this.areDetailsExpanded,
						onExpandedChange: expanded => this.areDetailsExpanded = expanded
					}),
				)
				: null,
			search
		})
	}

	private async getRecipientClickedContextButtons(model: MailEditorViewModel, recipient: ResolvableRecipient, field: RecipientField): Promise<DropdownChildAttrs[]> {

		const canEditBubbleRecipient = logins.getUserController().isInternalUser() && !logins.isEnabled(FeatureType.DisableContacts)

		const createdContactReceiver = async (contactElementId: Id) => {
			const mailAddress = recipient.address
			const contactListId = await model.getContactListId()
			if (contactListId != null) {
				const contact = await model.entity.load(ContactTypeRef, [contactListId, contactElementId])
				if (contact.mailAddresses.find(ma => cleanMatch(ma.address, mailAddress))) {
					recipient.setName(getContactDisplayName(contact))
					recipient.setContact(contact)
				} else {
					model.removeRecipient(recipient, field, false)
				}
			}
		}

		const buttons: Array<DropdownChildAttrs> = [{
			info: recipient.address,
			center: true,
			bold: true,
		}]

		if (canEditBubbleRecipient) {
			if (recipient.contact?._id != null) {
				buttons.push({
					label: () => lang.get("editContact_label"),
					type: ButtonType.Secondary,
					click: async () => {
						const {ContactEditor} = await import("../../contacts/ContactEditor")
						new ContactEditor(model.entity, recipient.contact).show()
					},
				})
			} else {
				buttons.push({
					label: () => lang.get("createContact_action"),
					type: ButtonType.Secondary,
					click: async () => {
						const contactListId = await model.getContactListId()
						const newContact = createNewContact(logins.getUserController().user, recipient.address, recipient.name)
						const {ContactEditor} = await import("../../contacts/ContactEditor")
						new ContactEditor(model.entity, newContact, contactListId ?? undefined, createdContactReceiver).show()
					},
				})
			}
		}

		if (model.canRemoveRecipients()) {
			buttons.push({
				label: "remove_action",
				type: ButtonType.Secondary,
				click: () => model.removeRecipient(recipient, field, false),
			})
		}

		return buttons
	}

	private renderAttachmentButton(model: MailEditorViewModel, file: Attachment): Children {
		return m(ButtonN, attachDropdown({
			mainButtonAttrs: {
				label: () => file.name,
				icon: () => Icons.Attachment,
				type: ButtonType.Bubble,
				staticRightText: "(" + formatStorageSize(Number(file.size)) + ")",
				colors: ButtonColor.Elevated,
			}, childAttrs: () => [
				{
					label: "download_action",
					type: ButtonType.Secondary,
					click: () => model.downloadAttachment(file),
				},
				{
					label: "remove_action",
					type: ButtonType.Secondary,
					click: () => {
						model.removeAttachment(file)
						m.redraw()
					},
				},
			]
		}))
	}

}

async function openTemplates(model: MailEditorViewModel, templateModel: TemplatePopupModel) {
	await templateModel.init()
	showTemplatePopupInEditor(templateModel, model.editor, null, model.editor.getSelectedText())
}

async function animateHeight(domElement: HTMLElement, fadein: boolean) {
	const childHeight = domElement.offsetHeight
	await animations.add(domElement, fadein ? height(0, childHeight) : height(childHeight, 0))
	domElement.style.height = ""
}
