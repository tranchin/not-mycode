import {Attachment, InitAsResponseArgs} from "./SendMailModel.js"
import {InlineImages} from "../view/MailViewer.js"
import {MailboxDetail} from "../model/MailModel.js"
import {Dialog} from "../../gui/base/Dialog.js"
import {ConversationEntryTypeRef, File as TutanotaFile, Mail, MailTypeRef} from "../../api/entities/tutanota/TypeRefs.js"
import {checkAttachmentSize, conversationTypeString, LINE_BREAK} from "../model/MailUtils.js"
import {client} from "../../misc/ClientDetector.js"
import {InfoLink, lang} from "../../misc/LanguageViewModel.js"
import {logins} from "../../api/main/LoginController.js"
import {appendEmailSignature} from "../signature/Signature.js"
import {parseMailtoUrl} from "../../misc/parsing/MailAddressParser.js"
import {locator} from "../../api/main/MainLocator.js"
import {downcast, isNotNull, noOp, ofClass} from "@tutao/tutanota-utils"
import m from "mithril"
import {CancelledError} from "../../api/common/error/CancelledError.js"
import {Recipients} from "../../api/common/recipients/Recipient.js"
import {checkApprovalStatus} from "../../misc/LoginUtils.js"
import {ConversationType, Keys, MailMethod} from "../../api/common/TutanotaConstants.js"
import {showProgressDialog} from "../../gui/dialogs/ProgressDialog.js"
import {UserError} from "../../api/main/UserError.js"
import {showUserError} from "../../misc/ErrorHandlerImpl.js"
import stream from "mithril/stream"
import {SaveErrorReason, SaveStatus, SaveStatusEnum} from "../model/MinimizedMailEditorViewModel.js"
import {isOfflineError} from "../../api/common/utils/ErrorCheckUtils.js"
import {showMinimizedMailEditor} from "../view/MinimizedMailEditorOverlay.js"
import {DialogHeaderBarAttrs} from "../../gui/base/DialogHeaderBar.js"
import {ButtonType} from "../../gui/base/ButtonN.js"
import {isBrowser, isDesktop} from "../../api/common/Env.js"
import {windowFacade} from "../../misc/WindowFacade.js"
import {TemplatePopupModel} from "../../templates/model/TemplatePopupModel.js"
import {Shortcut} from "../../misc/KeyManager.js"
import {MailEditorContent} from "./MailEditorContent.js"
import {defaultMailEditorViewModel, MailEditorViewModel} from "./MailEditorViewModel.js"
import {RecipientsSearchModel} from "../../misc/RecipientsSearchModel.js"
import {NotFoundError} from "../../api/common/error/RestError.js"

/**
 * Creates a new Dialog with a MailEditor inside.
 * @param model
 * @param blockExternalContent
 * @returns {Dialog}
 * @private
 */
async function doShowMailEditor(model: MailEditorViewModel, blockExternalContent: boolean = false) {
	let dialog: Dialog

	const save = (showProgress: boolean = true) => {
		const savePromise = model.saveDraft(true, MailMethod.NONE)

		if (showProgress) {
			return showProgressDialog("save_msg", savePromise)
		} else {
			return savePromise
		}
	}

	const send = async () => {
		try {
			const success = await model.send(MailMethod.NONE, Dialog.confirm, showProgressDialog)
			if (success) {
				dispose()
				dialog.close()
			}
		} catch (e) {
			if (e instanceof UserError) {
				showUserError(e)
			} else {
				throw e
			}
		}
	}

	const dispose = () => {
		model.dispose()
		if (templatePopupModel) templatePopupModel.dispose()
	}

	const minimize = () => {
		const saveStatus = stream<SaveStatus>({status: SaveStatusEnum.Saving})
		save(false)
			.then(() => saveStatus({status: SaveStatusEnum.Saved}))
			.catch(e => {

				const reason = isOfflineError(e)
					? SaveErrorReason.ConnectionLost
					: SaveErrorReason.Unknown

				saveStatus({status: SaveStatusEnum.NotSaved, reason})

				// If we don't show the error in the minimized error dialog,
				// Then we need to communicate it in a dialog or as an unhandled error
				if (reason === SaveErrorReason.Unknown) {
					if (e instanceof UserError) {
						showUserError(e)
					} else {
						throw e
					}
				}
			})
			.finally(() => m.redraw())
		showMinimizedMailEditor(dialog, model, locator.minimizedMailModel, locator.eventController, dispose, saveStatus)
	}

	let windowCloseUnsubscribe = noOp

	const headerBarAttrs: DialogHeaderBarAttrs = {
		left: [{
			label: "close_alt",
			click: () => minimize(),
			type: ButtonType.Secondary,
		}],
		right: [
			{
				label: "send_action",
				click: () => {
					send()
				},
				type: ButtonType.Primary,
			},
		],
		middle: () => conversationTypeString(model.getConversationType()),
		create: () => {
			if (isBrowser()) {
				// Have a simple listener on browser, so their browser will make the user ask if they are sure they want to close when closing the tab/window
				windowCloseUnsubscribe = windowFacade.addWindowCloseListener(() => {
				})
			} else if (isDesktop()) {
				// Simulate clicking the Close button when on the desktop so they can see they can save a draft rather than completely closing it
				windowCloseUnsubscribe = windowFacade.addWindowCloseListener(() => {
					minimize()
				})
			}
		},
		remove: () => {
			windowCloseUnsubscribe()
		},
	}
	const templatePopupModel = logins.isInternalUserLoggedIn() && client.isDesktopDevice()
		? new TemplatePopupModel(
			locator.eventController,
			logins,
			locator.entityClient
		)
		: null

	const search = new RecipientsSearchModel(
		locator.recipientsModel,
		locator.contactModel,
		isBrowser() ? null : locator.systemFacade
	)

	const shortcuts: Shortcut[] = [
		{
			key: Keys.ESC,
			exec: () => {
				minimize()
			},
			help: "close_alt",
		},
		{
			key: Keys.S,
			ctrl: true,
			exec: () => {
				save().catch(ofClass(UserError, showUserError))
			},
			help: "save_action",
		},
		{
			key: Keys.S,
			ctrl: true,
			shift: true,
			exec: () => {
				send()
			},
			help: "send_action",
		},
		{
			key: Keys.RETURN,
			ctrl: true,
			exec: () => {
				send()
			},
			help: "send_action",
		},
	]

	dialog = Dialog.largeDialog(headerBarAttrs, {
		view: () => {
			return m(MailEditorContent, {
				model,
				search,
				templatePopupModel,
				parentDialog: dialog
			})
		}
	})

	dialog.setCloseHandler(() => minimize())

	for (let shortcut of shortcuts) {
		dialog.addShortcut(shortcut)
	}

	await dialog.show()
}

async function getViewModel(doBlockExternalContent: boolean, mailboxDetails?: MailboxDetail): Promise<MailEditorViewModel> {
	return defaultMailEditorViewModel({doBlockExternalContent}, await getMailbox(mailboxDetails))
}

/**
 * open a MailEditor
 * @param mailboxDetails details to use when sending an email
 * @returns {*}
 * @private
 * @throws PermissionError
 */
export async function showMailEditorDialog(mailboxDetails: MailboxDetail) {
	// We check approval status so as to get a dialog informing the user that they cannot send mails
	// but we still want to open the mail editor because they should still be able to contact sales@tutao.de
	await checkApprovalStatus(logins, false)
	const {appendEmailSignature} = await import("../signature/Signature")
	const signature = appendEmailSignature("", logins.getUserController().props)
	await showMailEditorWithTemplate(mailboxDetails, {}, "", signature)
}

export async function showResponseMailEditor(
	args: InitAsResponseArgs,
	doBlockExternalContent: boolean,
	inlineImages: InlineImages,
	mailboxDetails?: MailboxDetail,
) {
	const model = await getViewModel(doBlockExternalContent, mailboxDetails)

	const conversationEntry = await locator.entityClient.load(ConversationEntryTypeRef, args.previousMail.conversationEntry)
										   .catch(ofClass(NotFoundError, e => {
											   console.log("could not load conversation entry", e)
										   }))

	const previousMessageId = conversationEntry?.messageId

	model.init({
		conversationType: args.conversationType,
		subject: args.subject,
		bodyText: args.bodyText,
		recipients: args.recipients,
		senderMailAddress: args.senderMailAddress,
		confidential: args.previousMail.confidential,
		attachments: args.attachments,
		replyTos: args.replyTos,
		previousMail: args.previousMail,
		previousMessageId,
	})

	return doShowMailEditor(model)
}

export async function showDraftMailEditor(
	draft: Mail,
	attachments: Array<TutanotaFile>,
	bodyText: string,
	doBlockExternalContent: boolean,
	inlineImages: InlineImages,
	mailboxDetails?: MailboxDetail,
) {
	const model = defaultMailEditorViewModel({doBlockExternalContent}, await getMailbox(mailboxDetails))

	let previousMessageId: string | null = null
	let previousMail: Mail | null = null

	const conversationEntry = await locator.entityClient.load(ConversationEntryTypeRef, draft.conversationEntry)
	const conversationType = downcast<ConversationType>(conversationEntry.conversationType)

	if (conversationEntry.previous) {
		try {
			const previousEntry = await locator.entityClient.load(ConversationEntryTypeRef, conversationEntry.previous)
			previousMessageId = previousEntry.messageId
			if (previousEntry.mail) {
				previousMail = await locator.entityClient.load(MailTypeRef, previousEntry.mail)
			}
		} catch (e) {
			if (e instanceof NotFoundError) {
				// ignore
			} else {
				throw e
			}
		}
	}

	const {confidential, sender, toRecipients, ccRecipients, bccRecipients, subject, replyTos} = draft
	const recipients: Recipients = {
		to: toRecipients,
		cc: ccRecipients,
		bcc: bccRecipients,
	}

	model.init({
		conversationType: conversationType,
		subject,
		bodyText,
		recipients,
		draft,
		senderMailAddress: sender.address,
		confidential,
		attachments,
		replyTos,
		previousMail,
		previousMessageId,
		inlineImages
	})

	await doShowMailEditor(model)
}

export async function showMailToUrlMailEditor(mailtoUrl: string, confidential: boolean, mailboxDetails?: MailboxDetail) {
	const mailbox = await getMailbox(mailboxDetails)
	const mailTo = parseMailtoUrl(mailtoUrl)
	let dataFiles: Attachment[] = []

	if (mailTo.attach) {
		const attach = mailTo.attach
		dataFiles = (await Promise.all(attach.map(uri => locator.fileController.getDataFile(uri)))).filter(isNotNull)
		// make sure the user is aware that (and which) files have been attached
		const keepAttachments =
			dataFiles.length === 0 ||
			(await Dialog.confirm("attachmentWarning_msg", "attachFiles_action", () =>
				dataFiles.map((df, i) =>
					m(
						".text-break.selectable.mt-xs",
						{
							title: attach[i],
						},
						df.name,
					),
				),
			))

		if (keepAttachments) {
			const sizeCheckResult = checkAttachmentSize(dataFiles)
			dataFiles = sizeCheckResult.attachableFiles

			if (sizeCheckResult.tooBigFiles.length > 0) {
				await Dialog.message(
					() => lang.get("tooBigAttachment_msg"),
					() => sizeCheckResult.tooBigFiles.map(file => m(".text-break.selectable", file)),
				)
			}
		} else {
			throw new CancelledError("user cancelled opening mail editor with attachments")
		}
	}

	await showMailEditorWithTemplate(
		mailbox,
		mailTo.recipients,
		mailTo.subject || "",
		appendEmailSignature(mailTo.body || "", logins.getUserController().props),
		dataFiles,
		confidential,
	)
}

export async function showMailEditorWithTemplate(
	mailboxDetails: MailboxDetail,
	recipients: Recipients,
	subject: string,
	bodyText: string,
	attachments?: ReadonlyArray<Attachment>,
	confidential?: boolean,
	senderMailAddress?: string,
) {
	const viewModel = defaultMailEditorViewModel({doBlockExternalContent: false}, mailboxDetails)
	viewModel.init({
		conversationType: ConversationType.NEW,
		subject,
		bodyText,
		recipients,
		attachments,
		confidential: confidential ?? null,
		senderMailAddress,
	})
	await doShowMailEditor(viewModel)
}

/**
 * Create and show a new mail editor with a support query, addressed to premium support,
 * or show an option to upgrade
 * @param subject
 * @param mailboxDetails
 * @returns {Promise<any>|Promise<R>|*}
 */
export async function showSupportMailEditor(subject: string = "", mailboxDetails?: MailboxDetail) {
	const {getTimeZone} = await import("../../calendar/date/CalendarUtils")
	const {formatPrice} = await import("../../subscription/PriceUtils")
	const {showUpgradeWizard} = await import("../../subscription/UpgradeSubscriptionWizard")

	if (logins.getUserController().isPremiumAccount()) {
		const mailbox = await getMailbox(mailboxDetails)
		const recipients = {
			to: [
				{
					name: null,
					address: "premium@tutao.de",
				},
			],
		}
		const signature = LINE_BREAK +
			LINE_BREAK +
			"--" +
			`<br>Client: ${client.getIdentifier()}` +
			`<br>Tutanota version: ${env.versionNumber}` +
			`<br>Time zone: ${getTimeZone()}` +
			`<br>User agent:<br> ${navigator.userAgent}`

		await showMailEditorWithTemplate(mailbox, recipients, subject, signature)
	} else {
		const message = lang.get("premiumOffer_msg", {
			"{1}": formatPrice(1, true),
		})
		const title = lang.get("upgradeReminderTitle_msg")
		const confirm = await Dialog.reminder(title, message, InfoLink.PremiumProBusiness)
		if (confirm) {
			showUpgradeWizard()
		}
	}
}

/**
 * Create and show a new mail editor with an invite message
 * @param mailboxDetails
 * @returns {*}
 */
export async function showInviteMailEditor(mailboxDetails?: MailboxDetail) {
	const mailbox = await getMailbox(mailboxDetails)
	const username = logins.getUserController().userGroupInfo.name
	const body = lang.get("invitationMailBody_msg", {
		"{registrationLink}": "https://mail.tutanota.com/signup",
		"{username}": username,
		"{githubLink}": "https://github.com/tutao/tutanota",
	})
	await showMailEditorWithTemplate(mailbox, {}, lang.get("invitationMailSubject_msg"), body, [], false)
}

/**
 * Create and show a new mail editor with an invite message
 * @param link: the link to the giftcard
 * @param svg: an SVGElement that is the DOM node of the rendered gift card
 * @param mailboxDetails
 * @returns {*}
 */
export async function showGiftCardMailEditor(link: string, svg: SVGElement, mailboxDetails?: MailboxDetail) {
	const bodyText = lang
		.get("defaultShareGiftCardBody_msg", {
			"{link}": '<a href="' + link + '">' + link + "</a>",
			"{username}": logins.getUserController().userGroupInfo.name,
		})
		.split("\n")
		.join("<br />")
	const subject = lang.get("defaultShareGiftCardSubject_msg")

	const model = await getViewModel(false, mailboxDetails)
	model.init({
		conversationType: ConversationType.NEW,
		subject,
		bodyText: appendEmailSignature(bodyText, logins.getUserController().props),
		recipients: {},
		attachments: [],
		confidential: false,
	})
	await doShowMailEditor(model, false)
}

async function getMailbox(mailbox?: MailboxDetail): Promise<MailboxDetail> {
	return mailbox ?? await locator.mailModel.getUserMailboxDetails()
}