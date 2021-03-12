//@flow
import type {Mail} from "../../api/entities/tutanota/Mail";
import type {EntityClient} from "../../api/common/EntityClient";
import type {WorkerClient} from "../../api/main/WorkerClient";
import {MailBodyTypeRef} from "../../api/entities/tutanota/MailBody";
import {getMailBodyText, getMailHeaders} from "../../api/common/utils/Utils";
import {FileTypeRef} from "../../api/entities/tutanota/File";
import {MailHeadersTypeRef} from "../../api/entities/tutanota/MailHeaders";
import {MailState} from "../../api/common/TutanotaConstants";
import {getLetId} from "../../api/common/utils/EntityUtils"
import type {HtmlSanitizer} from "../../misc/HtmlSanitizer"
import {promiseMap} from "../../api/common/utils/PromiseUtils"
import type {IProgressMonitor} from "../../api/common/utils/ProgressMonitor"
import {tapWorkDone} from "../../api/common/utils/ProgressMonitor"

/**
 * Used to pass all downloaded mail stuff to the desktop side to be exported as a file
 * Ideally this would just be {Mail, MailHeaders, MailBody, FileReference[]}
 * but we can't send Dates over to the native side so we may as well just extract everything here
 */
export type MailBundleRecipient = {address: string, name?: string}
export type MailBundle = {
	mailId: IdTuple,
	subject: string,
	body: string,
	sender: MailBundleRecipient,
	to: MailBundleRecipient[],
	cc: MailBundleRecipient[],
	bcc: MailBundleRecipient[],
	replyTo: MailBundleRecipient[],
	isDraft: boolean,
	isRead: boolean,
	sentOn: number, // UNIX timestamp
	receivedOn: number, // UNIX timestamp,
	headers: ?string,
	attachments: DataFile[],
}


/**
 * Downloads the mail body and the attachments for an email, to prepare for exporting
 * @param mail
 * @param entityClient
 * @param worker
 * @param sanitizer
 * @param progressMonitor: A progressmonitor which will have workdone called 3 + mail.attachments.length times
 */
export function makeMailBundle(mail: Mail, entityClient: EntityClient, worker: WorkerClient, sanitizer: HtmlSanitizer, progressMonitor: IProgressMonitor): Promise<MailBundle> {
	let bodyText, attachments, headers

	// Download all of the stuff in sequence, to avoid getting users blocked
	const downloadEverythingPromise =
		entityClient.load(MailBodyTypeRef, mail.body)
		            .then(getMailBodyText)
		            .then(bodyResult => {
			            bodyText = sanitizer.sanitize(bodyResult, {
				            blockExternalContent: false,
				            allowRelativeLinks: false,
				            usePlaceholderForInlineImages: false
			            }).text
			            progressMonitor.workDone(1)
		            })
		            .then(() => promiseMap(mail.attachments,
			            fileId => entityClient.load(FileTypeRef, fileId)
			                                  .then(worker.downloadFileContent.bind(worker))
			                                  .then(tapWorkDone(progressMonitor, 1))))
		            .then(attachmentsResult => attachments = attachmentsResult)
		            .then(() => mail.headers
			            ? entityClient.load(MailHeadersTypeRef, mail.headers)
			            : null)
		            .then(headersResult => {
			            headers = headersResult
			            progressMonitor.workDone(1)
		            })

	const recipientMapper = addr => ({address: addr.address, name: addr.name})

	return downloadEverythingPromise
		.then(() => {
			return {
				mailId: getLetId(mail),
				subject: mail.subject,
				body: bodyText,
				sender: recipientMapper(mail.sender),
				to: mail.toRecipients.map(recipientMapper),
				cc: mail.ccRecipients.map(recipientMapper),
				bcc: mail.bccRecipients.map(recipientMapper),
				replyTo: mail.replyTos.map(recipientMapper),
				isDraft: mail.state === MailState.DRAFT,
				isRead: !mail.unread,
				sentOn: mail.sentDate.getTime(),
				receivedOn: mail.receivedDate.getTime(),
				headers: headers && getMailHeaders(headers),
				attachments: attachments,
			}
		})
}