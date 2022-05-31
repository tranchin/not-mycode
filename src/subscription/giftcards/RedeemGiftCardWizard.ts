import m, {Children, Vnode, VnodeDOM} from "mithril"
import stream from "mithril/stream"
import {assertNotNull, downcast, lazy, LazyLoaded, mapNullable, neverNull, noOp, ofClass} from "@tutao/tutanota-utils"
import type {WizardPageAttrs, WizardPageN} from "../../gui/base/WizardDialogN"
import {createWizardDialog, emitWizardEvent, WizardEventType, wizardPageWrapper} from "../../gui/base/WizardDialogN"
import {LoginController, logins} from "../../api/main/LoginController"
import type {NewAccountData} from "../UpgradeSubscriptionWizard"
import {loadUpgradePrices} from "../UpgradeSubscriptionWizard"
import {Dialog} from "../../gui/base/Dialog"
import {LoginForm} from "../../login/LoginForm"
import {CredentialsSelector} from "../../login/CredentialsSelector"
import {showProgressDialog} from "../../gui/dialogs/ProgressDialog"
import {ButtonN, ButtonType} from "../../gui/base/ButtonN"
import {SignupForm} from "../SignupForm"
import {UserError} from "../../api/main/UserError"
import {showUserError} from "../../misc/ErrorHandlerImpl"
import type {AccountingInfo, GiftCardRedeemGetReturn} from "../../api/entities/sys/TypeRefs.js"
import {AccountingInfoTypeRef, CustomerInfoTypeRef} from "../../api/entities/sys/TypeRefs.js"
import {locator} from "../../api/main/MainLocator"
import {getTokenFromUrl, renderAcceptGiftCardTermsCheckbox, renderGiftCardSvg} from "./GiftCardUtils"
import {CancelledError} from "../../api/common/error/CancelledError"
import {lang, TranslationKey} from "../../misc/LanguageViewModel"
import {getLoginErrorMessage, handleExpectedLoginError} from "../../misc/LoginUtils"
import {RecoverCodeField} from "../../settings/RecoverCodeDialog"
import {HabReminderImage} from "../../gui/base/icons/Icons"
import {PaymentMethodType} from "../../api/common/TutanotaConstants"
import type {SubscriptionData, SubscriptionOptions, SubscriptionPlanPrices} from "../SubscriptionUtils"
import {SubscriptionType, UpgradePriceType} from "../SubscriptionUtils"
import {formatPrice, getPaymentMethodName, getSubscriptionPrice} from "../PriceUtils"
import {TextFieldN} from "../../gui/base/TextFieldN"
import {elementIdPart, isSameId} from "../../api/common/utils/EntityUtils"
import type {CredentialsInfo, ICredentialsProvider} from "../../misc/credentials/CredentialsProvider"
import {SessionType} from "../../api/common/SessionType.js";
import {LocationService} from "../../api/entities/sys/Services.js"
import {getByAbbreviation} from "../../api/common/CountryList.js"
import {NotAuthorizedError, NotFoundError} from "../../api/common/error/RestError.js"
import {IServiceExecutor} from "../../api/common/ServiceRequest.js"
import {GiftCardFacade} from "../../api/worker/facades/GiftCardFacade.js"
import {EntityClient} from "../../api/common/EntityClient.js"


const enum GetCredentialsMethod {
	Login,
	Signup
}

class RedeemGiftCardModel {
	mailAddress = ""
	newAccountData: NewAccountData | null = null
	credentialsMethod = GetCredentialsMethod.Signup

	private lazyStoredCredentials = new LazyLoaded<ReadonlyArray<CredentialsInfo>>(() => this.credentialsProvider.getInternalCredentialsInfos())
	private lazyPaymentMethod = new LazyLoaded<string>(async () => {
		const accountingInfo = await this.accountingInfo()

		return accountingInfo.paymentMethod
			? getPaymentMethodName(downcast<PaymentMethodType>(accountingInfo.paymentMethod))
			: getPaymentMethodName(PaymentMethodType.AccountBalance)
	})

	private lazyAccountingInfo = new LazyLoaded<AccountingInfo>(() => this.logins
																		  .getUserController()
																		  .loadAccountingInfo())

	constructor(
		private readonly config: {
			giftCardInfo: GiftCardRedeemGetReturn
			key: string
			premiumPrice: number
		},
		private readonly giftCardFacade: GiftCardFacade,
		private readonly credentialsProvider: ICredentialsProvider,
		private readonly logins: LoginController,
		private readonly entityClient: EntityClient,
		private readonly serviceExecutor: IServiceExecutor
	) {
	}

	get giftCardInfo(): GiftCardRedeemGetReturn {
		return this.config.giftCardInfo
	}

	get giftCardId(): Id {
		return elementIdPart(this.giftCardInfo.giftCard)
	}

	get key(): string {
		return this.config.key
	}

	get premiumPrice(): number {
		return this.config.premiumPrice
	}

	get message(): string {
		return this.config.giftCardInfo.message
	}

	storedCredentials(): Promise<ReadonlyArray<CredentialsInfo>> {
		return this.lazyStoredCredentials.getAsync()
	}

	paymentMethod() {
		return this.lazyPaymentMethod.getAsync()
	}

	accountingInfo() {
		return this.lazyAccountingInfo.getAsync()
	}

	async loginWithStoredCredentials(encryptedCredentials: CredentialsInfo) {
		if (logins.isUserLoggedIn() && isSameId(logins.getUserController().user._id, encryptedCredentials.userId)) {
			// If the user is logged in already (because they selected credentials and then went back) we dont have to do
			// anything, so just move on
			await this.postLogin()
		} else {
			await this.logins.logout(false)
			const credentials = await this.credentialsProvider.getCredentialsByUserId(encryptedCredentials.userId)

			if (credentials) {
				await this.logins.resumeSession(credentials, null, null)
				await this.postLogin()
			}
		}

	}

	async loginWithFormCredentials(mailAddress: string, password: string) {

		// If they try to login with a mail address that is stored, we want to swap out the old session with a new one
		await this.logins.logout(false)
		await this.logins.createSession(mailAddress, password, SessionType.Temporary)
		await this.postLogin()
	}

	async handleNewSignup(newAccountData: NewAccountData | null) {
		if (newAccountData || this.newAccountData) {
			// if there's an existing account it means the signup form was readonly
			// because we came back from the next page after having already signed up
			if (!this.newAccountData) {
				this.newAccountData = newAccountData
			}

			const {mailAddress, password} = neverNull(newAccountData || this.newAccountData)

			this.mailAddress = mailAddress

			await this.logins.createSession(mailAddress, password, SessionType.Temporary)
		}
	}

	private async postLogin(): Promise<void> {
		if (!this.logins.getUserController().isGlobalAdmin()) {
			throw new UserError("onlyAccountAdminFeature_msg")
		}

		const customer = await this.logins.getUserController().loadCustomer()
		const customerInfo = await this.entityClient.load(CustomerInfoTypeRef, customer.customerInfo)
		const accountingInfo = await this.entityClient.load(AccountingInfoTypeRef, customerInfo.accountingInfo)

		if (customer.businessUse || accountingInfo.business) {
			throw new UserError("onlyPrivateAccountFeature_msg")
		}
	}

	async redeemGiftCard(
		forCountry: string | null,
		getConfirmation: (_: TranslationKey | lazy<string>) => Promise<boolean>,
	): Promise<void> {
		const userLocation = await this.serviceExecutor.get(LocationService, null)

		const validCountry = getByAbbreviation(validCountryCode)

		if (!validCountry) {
			throw new UserError("invalidGiftCard_msg")
		}

		const validCountryName = validCountry.n
		const userCountry = getByAbbreviation(userLocation.country)
		const userCountryName = assertNotNull(userCountry).n
		if (userCountryName !== validCountryName && !await getConfirmation(() =>
			lang.get("validGiftCardCountry_msg", {
				"{valid}": validCountryName,
				"{actual}": userCountryName,
			})
		)) {
			throw new CancelledError("")
		}

		return this.giftCardFacade
				   .redeemGiftCard(this.giftCardId, this.key)
				   .catch(
					   ofClass(NotFoundError, () => {
						   throw new UserError("invalidGiftCard_msg")
					   }),
				   )
				   .catch(
					   ofClass(NotAuthorizedError, e => {
						   throw new UserError(() => e.message)
					   }),
				   )
	}
}

type GiftCardRedeemAttrs = WizardPageAttrs<RedeemGiftCardModel>

/**
 * This page gives the user the option to either signup or login to an account with which to redeem their gift card.
 */

class GiftCardWelcomePage implements WizardPageN<RedeemGiftCardModel> {
	private dom!: HTMLElement;

	oncreate(vnodeDOM: VnodeDOM<GiftCardRedeemAttrs>) {
		this.dom = vnodeDOM.dom as HTMLElement
	}

	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const a = vnode.attrs

		const nextPage = (method: GetCredentialsMethod) => {
			logins.logout(false).then(() => {
				a.data.credentialsMethod = method
				emitWizardEvent(this.dom, WizardEventType.SHOWNEXTPAGE)
			})
		}

		return [
			m(".flex-center.full-width.pt-l",
				m("",
					{
						style: {
							width: "480px",
						}
					},
					m(".pt-l",
						renderGiftCardSvg(
							parseFloat(a.data.giftCardInfo.value),
							null,
							a.data.message,
						),
					),
				),
			),
			m(".flex-center.full-width.pt-l",
				m("",
					{
						style: {
							width: "260px",
						},
					},
					m(ButtonN, {
						label: "existingAccount_label",
						click: () => nextPage(GetCredentialsMethod.Login),
						type: ButtonType.Login,
					}),
				),
			),
			m(".flex-center.full-width.pt-l.pb-m",
				m("",
					{
						style: {
							width: "260px",
						},
					},
					m(ButtonN, {
						label: "register_label",
						click: () => nextPage(GetCredentialsMethod.Signup),
						type: ButtonType.Login,
					}),
				),
			),
		]
	}
}

/**
 * This page will either show a signup or login form depending on how they choose to select their credentials
 * When they go to the next page the will be logged in.
 */

class GiftCardCredentialsPage implements WizardPageN<RedeemGiftCardModel> {
	private domElement: HTMLElement | null = null
	private loginFormHelpText = lang.get("emptyString_msg")
	private mailAddress = stream<string>("")
	private password = stream<string>("")
	private storedCredentials: ReadonlyArray<CredentialsInfo> = []

	constructor({attrs}: Vnode<WizardPageAttrs<RedeemGiftCardModel>>) {
		attrs.data.storedCredentials().then(credentials => {
			this.storedCredentials = credentials
			m.redraw()
		})
	}

	oncreate(vnode: VnodeDOM<GiftCardRedeemAttrs>) {
		this.domElement = vnode.dom as HTMLElement
	}

	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const data = vnode.attrs.data

		switch (data.credentialsMethod) {
			case GetCredentialsMethod.Login:
				return this.renderLoginPage(data)

			case GetCredentialsMethod.Signup:
				return this.renderSignupPage(data)
		}
	}

	onremove() {
		this.password("")
	}

	private renderLoginPage(model: RedeemGiftCardModel): Children {
		return [
			m(
				".flex-grow.flex-center.scroll",
				m(".flex-grow-shrink-auto.max-width-s.pt.plr-l", [
					this.renderLoginForm(model),
					this.renderCredentialsSelector(model),
				]),
			),
		]
	}

	private renderLoginForm(model: RedeemGiftCardModel): Children {
		return m(LoginForm, {
			onSubmit: async (mailAddress, password) => {
				if (mailAddress === "" || password === "") {
					this.loginFormHelpText = lang.get("loginFailed_msg")
				} else {
					// If they try to login with a mail address that is stored, we want to swap out the old session with a new one
					await showProgressDialog(
						"pleaseWait_msg",
						model.loginWithFormCredentials(this.mailAddress(), this.password())
							 .then(() => emitWizardEvent(this.domElement, WizardEventType.SHOWNEXTPAGE))
							 .catch(ofClass(UserError, showUserError))
							 .catch(e => {
								 this.loginFormHelpText = lang.getMaybeLazy(getLoginErrorMessage(e, false))
							 })
					)
				}
			},
			mailAddress: this.mailAddress,
			password: this.password,
			helpText: this.loginFormHelpText,
		})
	}

	private renderCredentialsSelector(model: RedeemGiftCardModel): Children {
		if (this.storedCredentials.length > 0) {
			return null
		}

		return m(CredentialsSelector, {
			credentials: this.storedCredentials,
			onCredentialsSelected: async encryptedCredentials => {
				try {
					await showProgressDialog("pleaseWait_msg", model.loginWithStoredCredentials(encryptedCredentials))
				} catch (e) {
					this.loginFormHelpText = lang.getMaybeLazy(getLoginErrorMessage(e, false))
					handleExpectedLoginError(e, noOp)
				}
			},
		})
	}

	private renderSignupPage(model: RedeemGiftCardModel): Children {
		return m(SignupForm, {
			// After having an account created we log them in to be in the same state as if they had selected an existing account
			newSignupHandler: newAccountData => {
				model.handleNewSignup(newAccountData)
					 .then(() => {
						 emitWizardEvent(this.domElement, WizardEventType.SHOWNEXTPAGE)
						 m.redraw()
					 })
					 .catch(e => {
						 // TODO when would login fail here and how does it get handled? can we attempt to login again?
						 Dialog.message("giftCardLoginError_msg")
						 m.route.set("/login", {
							 noAutoLogin: true,
						 })
					 })
			},
			readonly: model.newAccountData != null,
			prefilledMailAddress: model.newAccountData ? model.newAccountData.mailAddress : "",
			isBusinessUse: () => false,
			isPaidSubscription: () => false,
			campaign: () => null,
		})
	}
}

class RedeemGiftCardPage implements WizardPageN<RedeemGiftCardModel> {
	isConfirmed = false
	paymentMethod = ""
	country: string | null = null
	private dom!: HTMLElement;

	constructor({attrs}: Vnode<GiftCardRedeemAttrs>) {
		attrs.data.paymentMethod().then(paymentMethod => {
			this.paymentMethod = paymentMethod
			m.redraw()
		})
		if (!logins.getUserController().isFreeAccount()) {
			attrs.data.accountingInfo().then(accountingInfo => {
				this.country = accountingInfo.invoiceCountry
			})
		}
	}

	oncreate(vnodeDOM: VnodeDOM<GiftCardRedeemAttrs>) {
		this.dom = vnodeDOM.dom as HTMLElement
	}

	view(vnode: Vnode<GiftCardRedeemAttrs>): Children {
		const model = vnode.attrs.data
		const isFree = logins.getUserController().isFreeAccount()

		return m("", [
			mapNullable(
				model.newAccountData?.recoverCode, code => m(".pt-l.plr-l",
					m(RecoverCodeField, {
						showMessage: true,
						recoverCode: code,
					}),
				)
			),
			isFree
				? this.renderInfoForFreeAccounts(model)
				: this.renderInfoForPaidAccounts(model),
			m(".flex-center.full-width.pt-l",
				m(
					"",
					{
						style: {
							maxWidth: "620px",
						},
					},
					renderAcceptGiftCardTermsCheckbox(this.isConfirmed, confirmed => this.isConfirmed = confirmed),
				),
			),
			m(".flex-center.full-width.pt-s.pb",
				m(
					"",
					{
						style: {
							width: "260px",
						},
					},
					m(ButtonN, {
						label: "redeem_label",
						click: () => {
							if (!this.isConfirmed) {
								Dialog.message("termsAcceptedNeutral_msg")
								return
							}

							model.redeemGiftCard(this.country, Dialog.confirm)
								 .then(() => emitWizardEvent(this.dom, WizardEventType.CLOSEDIALOG))
								 .catch(ofClass(UserError, showUserError))
								 .catch(ofClass(CancelledError, noOp))
						},
						type: ButtonType.Login,
					}),
				),
			),
		])
	}

	private renderInfoForFreeAccounts(model: RedeemGiftCardModel): Children {
		return [
			m(".pt-l.plr-l",
				`${lang.get("giftCardUpgradeNotify_msg", {
					"{price}": formatPrice(model.premiumPrice, true),
					"{credit}": formatPrice(Number(model.giftCardInfo.value) - model.premiumPrice, true),
				})} ${lang.get("creditUsageOptions_msg")}`,
			),
			m(".center.h4.pt", lang.get("upgradeConfirm_msg")),
			m(".flex-space-around.flex-wrap", [
				m(".flex-grow-shrink-half.plr-l", [
					m(TextFieldN, {
						label: "subscription_label",
						value: "Premium",
						disabled: true,
					}),
					m(TextFieldN, {
						label: "paymentInterval_label",
						value: lang.get("pricing.yearly_label"),
						disabled: true,
					}),
					m(TextFieldN, {
						label: "price_label",
						value: formatPrice(Number(model.premiumPrice), true) + " " + lang.get("pricing.perYear_label"),
						disabled: true,
					}),
					m(TextFieldN, {
						label: "paymentMethod_label",
						value: this.paymentMethod,
						disabled: true,
					}),
				]),
				m(".flex-grow-shrink-half.plr-l.flex-center.items-end",
					m("img[src=" + HabReminderImage + "].pt.bg-white.border-radius", {
						style: {
							width: "200px",
						},
					}),
				),
			]),
		]
	}

	private renderInfoForPaidAccounts(model: RedeemGiftCardModel): Children {
		return [
			m(".pt-l.plr-l.flex-center",
				`${lang.get("giftCardCreditNotify_msg", {
					"{credit}": formatPrice(Number(model.giftCardInfo.value), true),
				})} ${lang.get("creditUsageOptions_msg")}`,
			),
			m(".flex-grow-shrink-half.plr-l.flex-center.items-end",
				m("img[src=" + HabReminderImage + "].pt.bg-white.border-radius", {
					style: {
						width: "200px",
					},
				}),
			),
		]
	}
}

export async function loadRedeemGiftCardWizard(hashFromUrl: string): Promise<Dialog> {

	const model = await loadModel(hashFromUrl)

	const wizardPages = [
		wizardPageWrapper(GiftCardWelcomePage, {
			data: model,
			headerTitle: () => lang.get("giftCard_label"),
			nextAction: async () => true,
			isSkipAvailable: () => false,
			isEnabled: () => true,
		}),
		wizardPageWrapper(GiftCardCredentialsPage, {
			data: model,
			headerTitle: () => lang.get(model.credentialsMethod === GetCredentialsMethod.Signup ? "register_label" : "login_label"),
			nextAction: async () => true,
			isSkipAvailable: () => false,
			isEnabled: () => true,
		}),
		wizardPageWrapper(RedeemGiftCardPage, {
			data: model,
			headerTitle: () => lang.get("redeem_label"),
			nextAction: async () => true,
			isSkipAvailable: () => false,
			isEnabled: () => true,
		}),
	]
	return createWizardDialog(model, wizardPages, async () => {
		const urlParams =
			model.credentialsMethod === GetCredentialsMethod.Signup
				? {
					loginWith: model.mailAddress,
				}
				: {}
		m.route.set("/login", urlParams)
	}).dialog
}

async function loadModel(hashFromUrl: string): Promise<RedeemGiftCardModel> {

	const {id, key} = await getTokenFromUrl(hashFromUrl)
	const giftCardInfo = await locator.giftCardFacade.getGiftCardInfo(id, key)
	const prices = await loadUpgradePrices(null)

	const priceData: SubscriptionPlanPrices = {
		Premium: prices.premiumPrices,
		PremiumBusiness: prices.premiumBusinessPrices,
		Teams: prices.teamsPrices,
		TeamsBusiness: prices.teamsBusinessPrices,
		Pro: prices.proPrices,
	}

	const subscriptionData: SubscriptionData = {
		options: {
			businessUse: () => false,
			paymentInterval: () => 12,
		} as SubscriptionOptions,
		planPrices: priceData,
	}

	return new RedeemGiftCardModel(
		{
			giftCardInfo,
			key,
			premiumPrice: getSubscriptionPrice(subscriptionData, SubscriptionType.Premium, UpgradePriceType.PlanActualPrice),
		},
		locator.giftCardFacade,
		locator.credentialsProvider,
		logins,
		locator.entityClient,
		locator.serviceExecutor
	)
}
