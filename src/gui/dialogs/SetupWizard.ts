import { createWizardDialog, wizardPageWrapper } from "../base/WizardDialog.js"
import { defer } from "@tutao/tutanota-utils"
import { SetupCongratulationsPage, SetupCongratulationsPageAttrs } from "./setupwizardpages/SetupCongraulationsPage.js"
import { isApp } from "../../api/common/Env.js"
import { deviceConfig } from "../../misc/DeviceConfig.js"

// Show the onboarding wizard if this is the first time the app has been opened since install
export async function showSetupWizardIfNeeded(): Promise<void> {
	const isSetupComplete = deviceConfig.getIsSetupComplete()
	if (isApp() && !isSetupComplete) {
		await showSetupWizard()
	}
}

export async function showSetupWizard(): Promise<void> {
	const wizardPages = [wizardPageWrapper(SetupCongratulationsPage, new SetupCongratulationsPageAttrs())]
	const deferred = defer<void>()

	const wizardBuilder = createWizardDialog(null, wizardPages, async () => {
		deviceConfig.setIsSetupComplete(true)
		deferred.resolve()
	})
	wizardBuilder.dialog.show()
	return deferred.promise
}
