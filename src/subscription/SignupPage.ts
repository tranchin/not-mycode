import m, {Children, Component, Vnode, VnodeDOM} from "mithril"
import type {TranslationKey} from "../misc/LanguageViewModel"
import type {UpgradeSubscriptionData} from "./UpgradeSubscriptionWizard"
import {getDisplayNameOfSubscriptionType, SubscriptionType} from "./SubscriptionUtils"
import type {WizardPageAttrs} from "../gui/base/WizardDialogN"
import {emitWizardEvent, WizardEventType} from "../gui/base/WizardDialogN"
import {SignupForm} from "./SignupForm"
import {UsageTest, UsageTestController} from "@tutao/tutanota-usagetests"

type ConfirmStatus = {
	type: string
	text: TranslationKey
}

export class SignupPage implements Component<SignupPageAttrs> {
	private dom!: HTMLElement;

	oncreate(vnode: VnodeDOM<WizardPageAttrs<UpgradeSubscriptionData>>) {
		this.dom = vnode.dom as HTMLElement
	}

	view(vnode: Vnode<SignupPageAttrs>): Children {
		const data = vnode.attrs.data
		const newAccountData = data.newAccountData
		let mailAddress: undefined | string = undefined
		if (newAccountData) mailAddress = newAccountData.mailAddress
		return vnode.attrs.repeatPasswordTest().renderVariant({
			[0]: () => m(SignupForm, {
				newSignupHandler: newAccountData => {
					if (newAccountData) data.newAccountData = newAccountData
					emitWizardEvent(this.dom, WizardEventType.SHOWNEXTPAGE)
				},
				isBusinessUse: data.options.businessUse,
				isPaidSubscription: () => data.type !== SubscriptionType.Free,
				campaign: () => data.campaign,
				prefilledMailAddress: mailAddress,
				readonly: !!newAccountData,
				repeatPassword: true
			}),
			[1]: () => m(SignupForm, {
				newSignupHandler: newAccountData => {
					if (newAccountData) data.newAccountData = newAccountData
					emitWizardEvent(this.dom, WizardEventType.SHOWNEXTPAGE)
				},
				isBusinessUse: data.options.businessUse,
				isPaidSubscription: () => data.type !== SubscriptionType.Free,
				campaign: () => data.campaign,
				prefilledMailAddress: mailAddress,
				readonly: !!newAccountData,
				repeatPassword: false
			}),
		})
	}
}

export class SignupPageAttrs implements WizardPageAttrs<UpgradeSubscriptionData> {
	data: UpgradeSubscriptionData

	constructor(signupData: UpgradeSubscriptionData,
				private readonly usageTestController: UsageTestController
	) {
		this.data = signupData
	}

	headerTitle(): string {
		var title = getDisplayNameOfSubscriptionType(this.data.type)

		if (this.data.type === SubscriptionType.PremiumBusiness || this.data.type === SubscriptionType.TeamsBusiness) {
			return title + " Business"
		} else {
			return title
		}
	}

	nextAction(showErrorDialog: boolean): Promise<boolean> {
		// next action not available for this page
		return Promise.resolve(true)
	}

	isSkipAvailable(): boolean {
		return false
	}

	isEnabled(): boolean {
		return true
	}

	repeatPasswordTest(): UsageTest {
		return this.usageTestController.getTest("signup.repeatPassword")
	}
}