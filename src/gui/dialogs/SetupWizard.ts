import { createWizardDialog, wizardPageWrapper } from "../base/WizardDialog.js"
import { defer } from "@tutao/tutanota-utils"
import { SetupCongratulationsPage, SetupCongratulationsPageAttrs } from "./setupwizardpages/SetupCongraulationsPage.js"
import { isApp } from "../../api/common/Env.js"

// TODO: Finish this function
function isSetupNeeded(): boolean {
	return isApp()
}

// Show the onboarding wizard if this is the first time the app has been opened since install
export async function showSetupWizardIfNeeded(): Promise<void> {
	if (isSetupNeeded()) {
		await showSetupWizard()
	}
}

export async function showSetupWizard(): Promise<void> {
	const wizardPages = [wizardPageWrapper(SetupCongratulationsPage, new SetupCongratulationsPageAttrs())]
	const deferred = defer<void>()

	const wizardBuilder = createWizardDialog(null, wizardPages, async () => {
		deferred.resolve()
	})
	wizardBuilder.dialog.show()
	return deferred.promise
}
