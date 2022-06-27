import {ApprovalStatus, MailMethod} from "../api/common/TutanotaConstants.js"
import {lang, TranslationKey, TranslationText} from "../misc/LanguageViewModel.js"
import {UserError} from "../api/main/UserError.js"
import {ofClass} from "@tutao/tutanota-utils"
import {AccessBlockedError, LockedError, NotAuthorizedError, PreconditionFailedError, TooManyRequestsError} from "../api/common/error/RestError.js"
import {RecipientNotResolvedError} from "../api/common/error/RecipientNotResolvedError.js"
import {RecipientsNotFoundError} from "../api/common/error/RecipientsNotFoundError.js"
import {checkApprovalStatus} from "../misc/LoginUtils.js"
import {FileNotFoundError} from "../api/common/error/FileNotFoundError.js"
import {TOO_MANY_VISIBLE_RECIPIENTS} from "./editor/SendMailModel.js"
import {LoginController} from "../api/main/LoginController.js"
import {Recipient, RecipientType} from "../api/common/recipients/Recipient.js"
import {MailFacade} from "../api/worker/facades/MailFacade.js"
import {Mail} from "../api/entities/tutanota/TypeRefs.js"
import {createApprovalMail} from "../api/entities/monitor/TypeRefs.js"
import {stringToCustomId} from "../api/common/utils/EntityUtils.js"
import {EntityClient} from "../api/common/EntityClient.js"

export class MailSender {
	private mailMethod = MailMethod.NONE
	private toRecipients: Array<Recipient> = []
	private bccRecipients: Array<Recipient> = []
	private ccRecipients: Array<Recipient> = []
	private subject: string = ""
	private selectedNotificationLanguage: string = lang.code
	private draft: Mail | null = null
	private body: string = ""
	private senderAddress: string

	private get allRecipients(): Array<Recipient> {
		return this.toRecipients.concat(this.ccRecipients).concat(this.bccRecipients)
	}

	private get externalRecipients(): Array<Recipient> {
		return this.allRecipients.filter(isExternalRecipient)
	}

	constructor(
		private readonly logins: LoginController,
		private readonly mailFacade: MailFacade,
		private readonly entity: EntityClient,
	) {
	}

	async send(
		getConfirmation: (arg0: TranslationText) => Promise<boolean> = _ => Promise.resolve(true),
		waitHandler: (arg0: TranslationText, arg1: Promise<any>) => Promise<any> = (_, p) => p,
		tooManyRequestsError: TranslationKey = "tooManyMails_msg",
	): Promise<boolean> {

		if (this.allRecipients.length === 1 && this.allRecipients[0].address.toLowerCase().trim() === "approval@tutao.de") {
			await this.sendApprovalMail()
			return true
		}

		if (this.toRecipients.length === 0 && this.ccRecipients.length === 0 && this.bccRecipients.length === 0) {
			throw new UserError("noRecipients_msg")
		}

		const numVisibleRecipients = this.toRecipients.length + this.ccRecipients.length

		// Many recipients is a warning
		if (numVisibleRecipients >= TOO_MANY_VISIBLE_RECIPIENTS && !(await getConfirmation("manyRecipients_msg"))) {
			return false
		}

		// Empty subject is a warning
		if (this.subject.length === 0 && !await getConfirmation("noSubject_msg")) {
			return false
		}

		// No password in external confidential mail is an error
		if (this.isConfidentialExternal() && this.getExternalRecipients().some(r => !this.getPassword(r.address))) {
			throw new UserError("noPreSharedPassword_msg")
		}

		// Weak password is a warning
		if (this.isConfidentialExternal() && this.hasInsecurePasswords() && !(await getConfirmation("presharedPasswordNotStrongEnough_msg"))) {
			return false
		}

		return waitHandler(
			this.isConfidential() ? "sending_msg" : "sendingUnencrypted_msg",
			Promise.resolve().then(async () => {
				const draft = await this.saveDraft(true)
				await this.updateContacts()
				await this.mailFacade.sendDraft(this.draft, this.allRecipients, this.selectedNotificationLanguage)
				await this.updatePreviousMail()
				await this.updateExternalLanguage()
				return true
			})
		).catch(e => this.handleSendError(e, tooManyRequestsError))
	}

	private async sendApprovalMail() {
		const listId = "---------c--"
		const mail = createApprovalMail({
			_id: [listId, stringToCustomId(this.senderAddress)],
			_ownerGroup: this.logins.getUserController().user.userGroup.group,
			text: `Subject: ${this.subject}<br>${this.body}`,
		})
		await this.entity.setup(listId, mail)
				  .catch(ofClass(NotAuthorizedError, e => console.log("not authorized for approval message")))
	}

	private async handleSendError(e: Error, tooManyRequestsErrorMessage: TranslationKey = "tooManyMails_msg"): Promise<boolean> {
		if (e instanceof LockedError) {
			throw new UserError("operationStillActive_msg")
		} else if (e instanceof RecipientNotResolvedError) {
			throw new UserError("tooManyAttempts_msg")
		} else if (e instanceof RecipientsNotFoundError) {
			if (this.mailMethod === MailMethod.ICAL_CANCEL) {
				// in case of calendar event cancellation we will remove invalid recipients and then delete the event without sending updates
				throw e
			} else {
				let invalidRecipients = e.message
				throw new UserError(
					() => lang.get("tutanotaAddressDoesNotExist_msg") + " " + lang.get("invalidRecipients_msg") + "\n" + invalidRecipients,
				)
			}
		} else if (e instanceof TooManyRequestsError) {
			throw new UserError(tooManyRequestsErrorMessage)
		} else if (e instanceof AccessBlockedError) {
			// special case: the approval status is set to SpamSender, but the update has not been received yet, so use SpamSender as default
			await checkApprovalStatus(this.logins, true, ApprovalStatus.SPAM_SENDER)
			console.log("could not send mail (blocked access)", e)
			return false
		} else if (e instanceof FileNotFoundError) {
			throw new UserError("couldNotAttachFile_msg")
		} else if (e instanceof PreconditionFailedError) {
			throw new UserError("operationStillActive_msg")
		} else {
			throw e
		}
	}
}

function isExternalRecipient(recipient: Recipient): recipient is RecipientType.EXTERNAL {
	return type === RecipientType.EXTERNAL
}