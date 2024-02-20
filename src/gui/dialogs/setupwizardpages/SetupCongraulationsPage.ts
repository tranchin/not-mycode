import m, { Children, Vnode } from "mithril"
import { WizardPageAttrs, WizardPageN } from "../../base/WizardDialog.js"

// TODO: Replace this placeholder with the final page.
export class SetupCongratulationsPage implements WizardPageN<null> {
	view({ attrs }: Vnode<WizardPageAttrs<null>>): Children {
		return [
			m(".center.h4.pt", "Welcome to Tuta Mail!"),
			m(
				".flex-center.full-width.pt-l",
				m(
					"p",
					{
						style: {
							width: "260px",
						},
					},
					"Please take a few moments to customise the app to your liking.",
				),
			),
		]
	}
}

export class SetupCongratulationsPageAttrs implements WizardPageAttrs<null> {
	preventGoBack = true
	hidePagingButtonForPage = false
	data: null = null

	headerTitle(): string {
		return "Welcome to Tuta Mail!"
	}

	nextAction(showDialogs: boolean): Promise<boolean> {
		// next action not available for this page
		return Promise.resolve(true)
	}

	isSkipAvailable(): boolean {
		return true
	}

	isEnabled(): boolean {
		return true
	}
}
