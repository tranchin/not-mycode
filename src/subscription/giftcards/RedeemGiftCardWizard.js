//@flow

import m from "mithril"
import stream from "mithril/stream/stream.js"
import {assertNotNull, neverNull, noOp} from "../../api/common/utils/Utils"
import type {WizardPageAttrs, WizardPageN} from "../../gui/base/WizardDialogN"
import {createWizardDialog, emitWizardEvent, WizardEventType} from "../../gui/base/WizardDialogN"
import {logins} from "../../api/main/LoginController"
import type {NewAccountData} from "../UpgradeSubscriptionWizard"
import {loadUpgradePrices} from "../UpgradeSubscriptionWizard"
import {Dialog, DialogType} from "../../gui/base/Dialog"
import {LoginForm} from "../../login/LoginForm"
import type {CredentialsSelectorAttrs} from "../../login/CredentialsSelector"
import {CredentialsSelector} from "../../login/CredentialsSelector"
import {deviceConfig} from "../../misc/DeviceConfig"
import {showProgressDialog} from "../../gui/base/ProgressDialog"
import {worker} from "../../api/main/WorkerClient"
import {client} from "../../misc/ClientDetector"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import type {SignupFormAttrs} from "../../api/main/SignupForm"
import {SignupForm} from "../../api/main/SignupForm"
import {NotAuthorizedError, NotFoundError} from "../../api/common/error/RestError"
import {LocationServiceGetReturnTypeRef} from "../../api/entities/sys/LocationServiceGetReturn"
import {serviceRequest, serviceRequestVoid} from "../../api/main/Entity"
import {SysService} from "../../api/entities/sys/Services"
import {HttpMethod} from "../../api/common/EntityFunctions"
import {createGiftCardRedeemData} from "../../api/entities/sys/GiftCardRedeemData"
import {UserError} from "../../api/common/error/UserError"
import {showUserError} from "../../misc/ErrorHandlerImpl"
import {CustomerInfoTypeRef} from "../../api/entities/sys/CustomerInfo"
import {locator} from "../../api/main/MainLocator"
import {AccountingInfoTypeRef} from "../../api/entities/sys/AccountingInfo"
import {getByAbbreviation} from "../../api/common/CountryList"
import type {GiftCardRedeemGetReturn} from "../../api/entities/sys/GiftCardRedeemGetReturn"
import {redeemGiftCard, renderGiftCard, renderGiftCardSvg, showGiftCardConfirmationDialog} from "./GiftCardUtils"
import {px, size} from "../../gui/size"
import {htmlSanitizer} from "../../misc/HtmlSanitizer"
import {CancelledError} from "../../api/common/error/CancelledError"
import {lang} from "../../misc/LanguageViewModel"
import {getLoginErrorMessage} from "../../misc/LoginUtils"

type GetCredentialsMethod = "login" | "signup"

type RedeemGiftCardWizardData = {
	mailAddress: Stream<string>,
	password: Stream<string>,
	giftCardInfo: GiftCardRedeemGetReturn,

	credentialsMethod: GetCredentialsMethod,
	credentials: Stream<?Credentials>,
	newAccountData: Stream<?NewAccountData>
}

type GiftCardRedeemAttrs = WizardPageAttrs<RedeemGiftCardWizardData>

class GiftCardWelcomePage implements WizardPageN<RedeemGiftCardWizardData> {

	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const a = vnode.attrs

		const nextPage = (method: GetCredentialsMethod) => {
			logins.logout(false).then(() => {
				a.data.credentialsMethod = method
				emitWizardEvent(vnode.dom, WizardEventType.SHOWNEXTPAGE)
			})
		}

		return [
			m(".flex-center.full-width.pt-l",
				m("", {style: {width: "480px"}}, renderGiftCard(parseFloat(a.data.giftCardInfo.value), a.data.giftCardInfo.message))
			),
			m(".flex-center.full-width.pt-l",
				m("", {style: {width: "260px"}},
					m(ButtonN, {
						label: () => "Use existing account", // TODO Translate
						click: () => nextPage("login"),
						type: ButtonType.Login
					})
				)
			),
			m(".flex-center.full-width.pt-l.pb-m",
				m("", {style: {width: "260px"}},
					m(ButtonN, {
						label: "register_label",
						click: () => nextPage("signup"),
						type: ButtonType.Login
					})
				))
		]
	}
}

class GiftCardCredentialsPage implements WizardPageN<RedeemGiftCardWizardData> {

	_domElement: HTMLElement
	_loginFormHelpText: string

	oninit() {
		this._loginFormHelpText = lang.get("emptyString_msg")
	}

	oncreate(vnode: Vnode<GiftCardRedeemAttrs>) {
		this._domElement = vnode.dom
	}

	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const data = vnode.attrs.data
		switch (data.credentialsMethod) {
			case "login":
				return this._renderLoginPage(data)
			case "signup":
				return this._renderSignupPage(data)
		}
	}

	_renderLoginPage(data: RedeemGiftCardWizardData): Children {
		const loginFormAttrs = {
			onSubmit: (mailAddress, password) => {
				if (mailAddress === "" || password === "") {
					this._loginFormHelpText = lang.get("loginFailed_msg")
				} else {
					const loginPromise =
						logins.logout(false)
						      .then(() => logins.createSession(mailAddress, password, client.getIdentifier(), false, false))
						      .then(credentials => this._postLogin(data, credentials))
						      .catch(e => { this._loginFormHelpText = lang.get(getLoginErrorMessage(e))})
					// If they try to login with a mail address that is stored, we want to swap out the old session with a new one
					showProgressDialog("pleaseWait_msg", loginPromise)
				}
			},
			mailAddress: data.mailAddress,
			password: data.password,
			helpText: () => this._loginFormHelpText
		}

		const onCredentialsSelected = credentials => {
			showProgressDialog("pleaseWait_msg", worker.initialized.then(() => {
				logins.logout(false)
				      .then(() => logins.resumeSession(credentials))
				      .then(() => this._postLogin(data, credentials))
			}))
		}

		const credentials = deviceConfig.getAllInternal()
		const credentialsSelectorAttrs: CredentialsSelectorAttrs = {
			credentials: () => credentials,
			isDeleteCredentials: stream(false),
			onCredentialsSelected,
			onCredentialsDelete: noOp
		}

		return [
			m(".flex-grow.flex-center.scroll", m(".flex-grow-shrink-auto.max-width-s.pt.plr-l",
				m(LoginForm, loginFormAttrs),
				credentials.length > 0
					? m(CredentialsSelector, credentialsSelectorAttrs)
					: null
				)
			)
		]
	}

	_renderSignupPage(data: RedeemGiftCardWizardData): Children {
		const existingAccountData = data.newAccountData()
		const isReadOnly = existingAccountData != null
		const signupFormAttrs: SignupFormAttrs = {
			newSignupHandler: newAccountData => {
				// TODO cleanup?
				console.log("new account data: ", newAccountData)
				if (newAccountData || existingAccountData) {
					if (!existingAccountData) {
						data.newAccountData(newAccountData)
					}
					const {mailAddress, password} = neverNull(newAccountData || existingAccountData)
					data.password(password)
					data.mailAddress(mailAddress)
					logins.createSession(mailAddress, password, client.getIdentifier(), false, false).then(credentials => {
						data.credentials(credentials)
						emitWizardEvent(this._domElement, WizardEventType.SHOWNEXTPAGE)
					}).catch(e => Dialog.error(() => "error signing up")) // Translate
				}
			},
			readonly: isReadOnly,
			prefilledMailAddress: existingAccountData ? existingAccountData.mailAddress : "",
			isBusinessUse: () => false,
			isPaidSubscription: () => false,
			campaign: () => null
		}

		return m(SignupForm, signupFormAttrs)
	}

	_postLogin(data: RedeemGiftCardWizardData, credentials: Credentials): Promise<void> {
		data.credentials(credentials)
		return Promise.resolve()
		              .then(() => {
			              if (!logins.getUserController().isGlobalAdmin()) throw new UserError(() => "Only account admin can use gift cards"); // Translate
		              })
		              .then(() => logins.getUserController().loadCustomer())
		              .then(customer => {
			              return locator.entityClient.load(CustomerInfoTypeRef, customer.customerInfo)
			                            .then(customerInfo => locator.entityClient.load(AccountingInfoTypeRef, customerInfo.accountingInfo))
			                            .then(accountingInfo => {
				                            if (customer.businessUse
					                            || accountingInfo.business) {
					                            throw new UserError(() => "Businesses cannot use gift cards"); // Translate
				                            } //Translate
			                            })
		              })
		              .then(() => {
			              emitWizardEvent(this._domElement, WizardEventType.SHOWNEXTPAGE)
		              })
		              .catch(UserError, showUserError)
	}
}


class RedeemGiftCardPage implements WizardPageN<RedeemGiftCardWizardData> {
	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const data = vnode.attrs.data

		const confirmButtonAttrs = {
			label: () => "Redeem gift card", // Translate
			click: () => {
				const wasFree = logins.getUserController().isFreeAccount()
				redeemGiftCard(data.giftCardInfo.giftCard, data.giftCardInfo.country, Dialog.confirm)
					.then(() => {
						showGiftCardConfirmationDialog(wasFree, () => emitWizardEvent(vnode.dom, WizardEventType.CLOSEDIALOG))
					})
					.catch(UserError, showUserError)
					.catch(CancelledError, noOp)
			},
			type: ButtonType.Login
		}

		return m(".flex-center.full-width.pt-l",
			[
				m("", {style: {width: "480px"}}, renderGiftCardSvg(parseFloat(data.giftCardInfo.value))),
				m(".pt-l", {style: {width: "260px"}}, m(ButtonN, confirmButtonAttrs))
			]
		)
	}
}


export function loadRedeemGiftCardWizard(giftCardInfo: GiftCardRedeemGetReturn): Promise<Dialog> {
	return loadUpgradePrices().then(prices => {

		const giftCardRedeemData: RedeemGiftCardWizardData = {
			newAccountData: stream(null),
			mailAddress: stream(""),
			password: stream(""),
			credentialsMethod: "signup",
			giftCardInfo: giftCardInfo,
			credentials: stream(null),
		}


		const wizardPages = [
			{
				attrs: {
					data: giftCardRedeemData,
					headerTitle: () => "You got a Gift Card :-)", // TODO Translate
					nextAction: (_) => Promise.resolve(true),
					isSkipAvailable: () => false,
					isEnabled: () => true
				},
				componentClass: GiftCardWelcomePage
			},
			{
				attrs: {
					data: giftCardRedeemData,
					headerTitle: () => giftCardRedeemData.credentialsMethod === "signup" ? "Create account" : "Select account", // TODO Translate
					nextAction: (showErrorDialog: boolean) => Promise.resolve(true),
					isSkipAvailable: () => false,
					isEnabled: () => true
				},
				componentClass: GiftCardCredentialsPage
			},
			{
				attrs: {
					data: giftCardRedeemData,
					headerTitle: () => "Confirm", // Translate
					nextAction: (_) => Promise.resolve(true),
					isSkipAvailable: () => false,
					isEnabled: () => true
				},
				componentClass: RedeemGiftCardPage
			}
		]

		const wizardBuilder = createWizardDialog(giftCardRedeemData, wizardPages, () => {
			return Promise.resolve() // TODO delete
		})
		const wizard = wizardBuilder.dialog
		wizardBuilder.promise.then(() => m.route.set("/login"))

		//we only return the dialog so that it can be shown
		return wizard
	})
}
