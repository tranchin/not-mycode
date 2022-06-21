import {logins} from "../../api/main/LoginController"
import {FeatureType} from "../../api/common/TutanotaConstants"
import {showInviteMailEditor as writeInviteMail1} from "../../mail/editor/MailEditorDialog.js";

export function showUpgradeDialog() {
	import("../../subscription/UpgradeSubscriptionWizard.js").then(upgradeWizard => upgradeWizard.showUpgradeWizard())
}

export function showSupportDialog() {
	import("../../support/SupportDialog.js").then(supportModule => supportModule.showSupportDialog())
}

export function writeInviteMail() {
	import("../../mail/editor/MailEditorDialog.js").then(mailEditorModule => writeInviteMail1())
}

export function isNewMailActionAvailable(): boolean {
	return logins.isInternalUserLoggedIn() && !logins.isEnabled(FeatureType.ReplyOnly)
}