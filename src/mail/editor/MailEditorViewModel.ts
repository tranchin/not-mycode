import {Children} from "mithril"
import type {Attachment, InitArgs} from "./SendMailModel"
import {defaultSendMailModel, SendMailModel} from "./SendMailModel"
import {debounce, defer, downcast, findAllAndRemove, lazy, ofClass, remove} from "@tutao/tutanota-utils"
import {Dialog} from "../../gui/base/Dialog"
import {getSubstitutedLanguageCode, lang, Language, languages, TranslationKey} from "../../misc/LanguageViewModel"
import type {File as TutanotaFile, Mail} from "../../api/entities/tutanota/TypeRefs.js"
import {FileOpenError} from "../../api/common/error/FileOpenError"
import {FileReference, isTutanotaFile} from "../../api/common/utils/FileUtils";
import {DataFile} from "../../api/common/DataFile";
import {Editor} from "../../gui/editor/Editor.js"
import {htmlSanitizer, HtmlSanitizer} from "../../misc/HtmlSanitizer.js"
import {LoginController, logins} from "../../api/main/LoginController.js"
import {FileController} from "../../file/FileController.js"
import {NativeFileApp} from "../../native/common/FileApp.js"
import {IUserController} from "../../api/main/UserController.js"
import {getEnabledMailAddressesWithUser, getTemplateLanguages, RecipientField} from "../model/MailUtils.js"
import {MailboxDetail, MailModel} from "../model/MailModel.js"
import {EntityClient} from "../../api/common/EntityClient.js"
import {cloneInlineImages, createInlineImage, InlineImageReference, replaceInlineImagesWithCids, revokeInlineImages} from "../view/MailGuiUtils.js"
import {ResolvableRecipient} from "../../api/main/RecipientsModel.js"
import {ContactModel} from "../../contacts/model/ContactModel.js"
import {KnowledgeBaseModel} from "../../knowledgebase/model/KnowledgeBaseModel.js"
import {styles} from "../../gui/styles.js"
import {isCustomizationEnabledForCustomer} from "../../api/common/utils/Utils.js"
import {ConversationType, FeatureType, MailMethod} from "../../api/common/TutanotaConstants.js"
import Stream from "mithril/stream"
import {EntityUpdateData, EventController, isUpdateForTypeRef} from "../../api/main/EventController.js"
import {CustomerPropertiesTypeRef} from "../../api/entities/sys/TypeRefs.js"
import {UserError} from "../../api/main/UserError.js"
import {locator} from "../../api/main/MainLocator.js"

type MailEditorViewModelConfig = {
	doBlockExternalContent: boolean
}

export class MailEditorViewModel {
	toFieldText = ""
	ccFieldText = ""
	bccFieldText = ""
	loadedInlineImages: Map<string, InlineImageReference> = new Map()

	private _doShowToolbar = false
	private selectedNotificationLanguage = ""
	private mentionedInlineImageCids: Array<string> = []
	// In the model because we have some logic to encapsulate
	inlineImageElements: Array<HTMLElement> = []
	private availableNotificationTemplateLanguages: Array<Language> = []

	private readonly deferredInitialized = defer<void>()

	get initialized(): Promise<void> {
		return this.deferredInitialized.promise
	}

	/** The editor lives on the ViewModel because it is stateful */
	readonly editor = new Editor(200, (html, isPaste) => {
		const sanitized = this.htmlSanitizer.sanitizeFragment(html, {
			blockExternalContent: !isPaste && this.doBlockExternalContent(),
		})

		this.mentionedInlineImageCids = sanitized.inlineImageCids
		return sanitized.html
	})

	private entityEventReceived = async (updates: ReadonlyArray<EntityUpdateData>): Promise<void> => {
		for (let update of updates) {
			await this.handleEntityEvent(update)
		}
	}

	get onChanged(): Stream<boolean> {
		return this.sendMailModel.onMailChanged
	}

	get userController(): IUserController {
		return this.logins.getUserController()
	}

	get mailModel(): MailModel {
		return this.sendMailModel.mailModel
	}

	constructor(
		private readonly config: MailEditorViewModelConfig,
		private readonly mailboxDetails: MailboxDetail,
		private readonly sendMailModel: SendMailModel,
		private readonly htmlSanitizer: HtmlSanitizer,
		private readonly logins: LoginController,
		readonly fileController: FileController,
		// lazy because we only want to access it when we know we are in a native context
		readonly fileApp: lazy<NativeFileApp>,
		readonly entity: EntityClient,
		private readonly contactModel: ContactModel,
		private readonly eventController: EventController
	) {
	}

	async init(args: InitArgs) {
		await this.updateAvailableNotificationTemplateLanguages()
		this.eventController.addEntityListener(this.entityEventReceived)

		if (args.inlineImages) {
			// if we reuse the same image references, changing the displayed mail in mail view will cause the minimized draft to lose
			// that reference, because it will be revoked
			this.loadedInlineImages = cloneInlineImages(args.inlineImages)
		}

		await this.editor.initialized.promise

		this.editor.setHTML(this.sendMailModel.getBody())
		// Add mutation observer to remove attachments when corresponding DOM element is removed
		new MutationObserver(() => this.cleanupInlineAttachments())
			.observe(this.editor.getDOM(), {
				attributes: false,
				childList: true,
				subtree: true,
			})
		// since the editor is the source for the body text, the model won't know if the body has changed unless we tell it
		this.editor.addChangeListener(() => this.sendMailModel.setBody(replaceInlineImagesWithCids(this.editor.getDOM()).innerHTML))
		this.editor.setCreatesLists(!this.usePlainTextFormatting())
		await this.sendMailModel.init(args)

		this.deferredInitialized.resolve()
	}

	dispose() {
		this.sendMailModel.dispose()
		revokeInlineImages(this.loadedInlineImages)
		this.eventController.removeEntityListener(this.entityEventReceived)
	}

	private cleanupInlineAttachments = debounce(50, () => {

		const domElement = this.editor.getDOM()
		const inlineImageElements = this.inlineImageElements
		const attachments = this.getAttachments()

		// Previously we replied on subtree option of MutationObserver to receive info when nested child is removed.
		// It works but it doesn't work if the parent of the nested child is removed, we would have to go over each mutation
		// and check each descendant and if it's an image with CID or not.
		// It's easier and faster to just go over each inline image that we know about. It's more bookkeeping but it's easier
		// code which touches less dome.
		//
		// Alternative would be observe the parent of each inline image but that's more complexity and we need to take care of
		// new (just inserted) inline images and also assign listener there.
		// Doing this check instead of relying on mutations also helps with the case when node is removed but inserted again
		// briefly, e.g. if some text is inserted before/after the element, Squire would put it into another diff and this
		// means removal + insertion.
		const elementsToRemove: HTMLElement[] = []
		inlineImageElements.forEach(inlineImage => {
			if (domElement && !domElement.contains(inlineImage)) {
				const cid = inlineImage.getAttribute("cid")
				const attachmentIndex = attachments.findIndex(a => a.cid === cid)

				if (attachmentIndex !== -1) {
					attachments.splice(attachmentIndex, 1)
					elementsToRemove.push(inlineImage)
				}
			}
		})
		findAllAndRemove(inlineImageElements, imageElement => elementsToRemove.includes(imageElement))

		this.sendMailModel.setMailChanged(true)
	})

	doBlockExternalContent(): boolean {
		return this.config.doBlockExternalContent
	}

	toggleConfidential() {
		this.sendMailModel.setConfidential(!this.sendMailModel.isConfidential())
	}

	isConfidential(): boolean {
		return this.sendMailModel.isConfidential()
	}

	containsExternalRecipients() {
		return this.sendMailModel.containsExternalRecipients()
	}

	containsConfidentialExternalRecipients(): boolean {
		return this.isConfidential() && this.containsExternalRecipients()
	}

	usePlainTextFormatting(): boolean {
		return this.logins.getUserController().props.sendPlaintextOnly
	}

	// TODO move all attachment logic out of sendMailModel. We don't need it for calendar events

	attachFiles(files: ReadonlyArray<Attachment>) {
		return this.sendMailModel.attachFiles(files)
	}

	attachInlineImage(file: DataFile) {
		const img = createInlineImage(file as DataFile)
		this.loadedInlineImages.set(img.cid, img)
		this.inlineImageElements.push(
			this.editor.insertImage(img.objectUrl, {
				cid: img.cid,
				style: "max-width: 100%",
			}),
		)
	}

	getAttachments(): Array<Attachment> {
		return this.sendMailModel.getAttachments()
	}

	async removeAttachment(file: Attachment) {
		await this.sendMailModel.removeAttachment(file)

		// If an attachment has a cid it means it could be in the editor's inline images too
		if (file.cid) {
			const imageElement = this.inlineImageElements.find(e => e.getAttribute("cid") === file.cid)

			if (imageElement) {
				imageElement.remove()
				remove(this.inlineImageElements, imageElement)
			}
		}
	}

	async downloadAttachment(attachment: Attachment) {
		try {
			if (attachment._type === "FileReference") {
				await this.fileApp().open(downcast(attachment))
			} else if (attachment._type === "DataFile") {
				await this.fileController.saveDataFile(downcast(attachment))
			} else {
				await this.fileController.downloadAndOpen((attachment as any) as TutanotaFile, true)
			}
		} catch (e) {
			if (e instanceof FileOpenError) {
				return Dialog.message("canNotOpenFileOnDevice_msg")
			} else {
				const msg = e.message || "unknown error"
				console.error("could not open file:", msg)
				return Dialog.message("errorDuringFileOpen_msg")
			}
		}
	}

	getEnabledMailAddresses(): Array<string> {
		return getEnabledMailAddressesWithUser(this.mailboxDetails, this.userController.userGroupInfo).sort()
	}

	setSender(sender: string) {
		this.sendMailModel.setSender(sender)
	}

	getSender(): string {
		return this.sendMailModel.getSender()
	}

	getAvailableNotificationTemplateLanguages(): Array<Language> {
		return this.availableNotificationTemplateLanguages
	}

	/**
	 * Sort list of all languages alphabetically
	 * then we see if the user has custom notification templates
	 * in which case we replace the list with just the templates that the user has specified
	 */
	private async updateAvailableNotificationTemplateLanguages(): Promise<void> {
		this.availableNotificationTemplateLanguages = languages.slice().sort((a, b) => lang.get(a.textId).localeCompare(lang.get(b.textId)))
		const filteredLanguages = await getTemplateLanguages(this.availableNotificationTemplateLanguages, this.entity, this.logins)
		if (filteredLanguages.length > 0) {
			const languageCodes = filteredLanguages.map(l => l.code)
			this.selectedNotificationLanguage =
				getSubstitutedLanguageCode(this.logins.getUserController().props.notificationMailLanguage || lang.code, languageCodes) || languageCodes[0]
			this.availableNotificationTemplateLanguages = filteredLanguages
		}
	}

	doShowToolbar(): boolean {
		return this._doShowToolbar
	}

	toggleShowToolbar() {
		this._doShowToolbar = !this._doShowToolbar
	}

	getSelectedNotificationLanguageCode(): string {
		return this.selectedNotificationLanguage
	}

	setSelectedNotificationLanguageCode(code: string) {
		this.selectedNotificationLanguage = code
	}

	canRemoveRecipients(): boolean {
		const previousMail = this.sendMailModel.getPreviousMail()
		return this.logins.getUserController().isInternalUser()
			&& (previousMail == null || !previousMail.restrictions || previousMail.restrictions.participantGroupInfos.length === 0)
	}

	removeRecipient(recipient: ResolvableRecipient, field: RecipientField, resolveLazily: boolean) {
		return this.sendMailModel.removeRecipient(recipient, field, resolveLazily)
	}

	async getContactListId() {
		return this.contactModel.contactListId()
	}

	getSubject() {
		return this.sendMailModel.getSubject()
	}

	setSubject(subject: string) {
		return this.sendMailModel.setSubject(subject)
	}

	isInternalUserLoggedIn(): boolean {
		return this.logins.isInternalUserLoggedIn()
	}

	getRecipient(field: RecipientField, address: string): ResolvableRecipient | null {
		return this.sendMailModel.getRecipient(field, address)
	}

	removeRecipientByAddress(address: string, field: RecipientField) {
		return this.sendMailModel.removeRecipientByAddress(address, field)
	}

	getRecipientList(field: RecipientField): Array<ResolvableRecipient> {
		return this.sendMailModel.getRecipientList(field)
	}

	async addRecipient(field: RecipientField, recipient: {address: string; name: string | null}) {
		return this.sendMailModel.addRecipient(field, recipient)
	}

	async loadKnowledgeBaseModel(): Promise<KnowledgeBaseModel | null> {
		if (!this.logins.isInternalUserLoggedIn()) {
			return null
		}

		const customer = await this.userController.loadCustomer()

		if (
			styles.isDesktopLayout() &&
			this.logins.getUserController().getTemplateMemberships().length > 0 &&
			isCustomizationEnabledForCustomer(customer, FeatureType.KnowledgeBase)
		) {
			return new KnowledgeBaseModel(this.eventController, this.entity, this.logins.getUserController()).init()
		} else {
			return null
		}
	}

	allRecipients(): Array<ResolvableRecipient> {
		return this.sendMailModel.allRecipients()
	}

	getPassword(address: string): string {
		return this.sendMailModel.getPassword(address)
	}

	setPassword(address: string, password: string) {
		return this.sendMailModel.setPassword(address, password)
	}

	getPasswordStrength(recipient: ResolvableRecipient): number {
		return this.sendMailModel.getPasswordStrength(recipient)
	}

	saveDraft(saveAttachments: boolean, method: MailMethod) {
		return this.sendMailModel.saveDraft(saveAttachments, method)
	}

	async send(
		method: MailMethod,
		getConfirmation: (messageIdOrMessageFunction: (TranslationKey | lazy<string>), confirmId?: TranslationKey, infoToAppend?: (string | lazy<Children>)) => Promise<boolean>,
		waitHandler: <T>(messageIdOrMessageFunction: (TranslationKey | lazy<string>), action: Promise<T>, progressStream?: Stream<number>) => Promise<T>
	) {

		const invalidText = [this.toFieldText, this.ccFieldText, this.bccFieldText]
			.map(text => text.trim())
			.filter(text => text !== "")
			.join("\n")

		if (invalidText !== "") {
			throw new UserError(() => lang.get("invalidRecipients_msg") + invalidText)
		}

		return this.sendMailModel.send(method, getConfirmation, waitHandler)
	}

	getDraft(): Readonly<Mail> | null {
		return this.sendMailModel.getDraft()
	}

	getConversationType(): ConversationType {
		return this.sendMailModel.getConversationType()
	}

	private async handleEntityEvent(update: EntityUpdateData) {
		if (isUpdateForTypeRef(CustomerPropertiesTypeRef, update)) {
			await this.updateAvailableNotificationTemplateLanguages()
		}
	}

	toRecipients(): Array<ResolvableRecipient> {
		return this.sendMailModel.toRecipients()
	}

	ccRecipients(): Array<ResolvableRecipient> {
		return this.sendMailModel.ccRecipients()
	}

	bccRecipients(): Array<ResolvableRecipient> {
		return this.sendMailModel.bccRecipients()
	}

	async downloadInlineImage(cid: string) {
		const inlineAttachment = this.getAttachments().find(attachment => attachment.cid === cid)

		if (inlineAttachment && isTutanotaFile(inlineAttachment)) {
			await this.fileController
					  .downloadAndOpen(downcast(inlineAttachment), true)
					  .catch(ofClass(FileOpenError, () => Dialog.message("canNotOpenFileOnDevice_msg")))
		}
	}
}

export function defaultMailEditorViewModel(config: MailEditorViewModelConfig, mailboxDetails: MailboxDetail): MailEditorViewModel {
	return new MailEditorViewModel(
		config,
		mailboxDetails,
		defaultSendMailModel(mailboxDetails),
		htmlSanitizer,
		logins,
		locator.fileController,
		() => locator.fileApp,
		locator.entityClient,
		locator.contactModel,
		locator.eventController
	)
}
