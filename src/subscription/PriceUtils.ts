import { BookingItemFeatureType, Const, PaidSubscriptionType, PaymentMethodType, SubscriptionName } from "../api/common/TutanotaConstants"
import { lang } from "../misc/LanguageViewModel"
import { assertNotNull, downcast, neverNull } from "@tutao/tutanota-utils"
import type { AccountingInfo, PriceData, PriceItemData } from "../api/entities/sys/TypeRefs.js"
import { createUpgradePriceServiceData, UpgradePriceServiceReturn } from "../api/entities/sys/TypeRefs.js"
import { SubscriptionConfig, SubscriptionPlanPrices, SubscriptionType, UpgradePriceType, WebsitePlanPrices } from "./FeatureListProvider"
import { locator } from "../api/main/MainLocator"
import { UpgradePriceService } from "../api/entities/sys/Services"
import { IServiceExecutor } from "../api/common/ServiceRequest"
import { ConnectionError } from "../api/common/error/RestError"
import { ProgrammingError } from "../api/common/error/ProgrammingError.js"

export const enum PaymentInterval {
	Monthly = 1,
	Yearly = 12,
}

export function asPaymentInterval(paymentInterval: string | number): PaymentInterval {
	if (typeof paymentInterval === "string") {
		paymentInterval = Number(paymentInterval)
	}
	switch (paymentInterval) {
		// additional cast to make this robust against changes to the PaymentInterval enum.
		case Number(PaymentInterval.Monthly):
			return PaymentInterval.Monthly
		case Number(PaymentInterval.Yearly):
			return PaymentInterval.Yearly
		default:
			throw new ProgrammingError(`invalid payment interval: ${paymentInterval}`)
	}
}

export function getPaymentMethodName(paymentMethod: PaymentMethodType): string {
	if (paymentMethod === PaymentMethodType.Invoice) {
		return lang.get("paymentMethodOnAccount_label")
	} else if (paymentMethod === PaymentMethodType.CreditCard) {
		return lang.get("paymentMethodCreditCard_label")
	} else if (paymentMethod === PaymentMethodType.Sepa) {
		return "SEPA"
	} else if (paymentMethod === PaymentMethodType.Paypal) {
		return "PayPal"
	} else if (paymentMethod === PaymentMethodType.AccountBalance) {
		return lang.get("paymentMethodAccountBalance_label")
	} else {
		return "<" + lang.get("comboBoxSelectionNone_msg") + ">"
	}
}

export function getPaymentMethodInfoText(accountingInfo: AccountingInfo): string {
	if (accountingInfo.paymentMethodInfo) {
		return accountingInfo.paymentMethod === PaymentMethodType.CreditCard
			? lang.get("endsWith_label") + " " + neverNull(accountingInfo.paymentMethodInfo)
			: neverNull(accountingInfo.paymentMethodInfo)
	} else {
		return ""
	}
}

export function formatPriceDataWithInfo(priceData: PriceData): string {
	return formatPriceWithInfo(Number(priceData.price), asPaymentInterval(priceData.paymentInterval), priceData.taxIncluded)
}

// Used on website, keep it in sync
export function formatPrice(value: number, includeCurrency: boolean): string {
	// round to two digits first because small deviations may exist at far away decimal places
	value = Math.round(value * 100) / 100

	if (includeCurrency) {
		return value % 1 !== 0 ? lang.formats.priceWithCurrency.format(value) : lang.formats.priceWithCurrencyWithoutFractionDigits.format(value)
	} else {
		return value % 1 !== 0 ? lang.formats.priceWithoutCurrency.format(value) : lang.formats.priceWithoutCurrencyWithoutFractionDigits.format(value)
	}
}

/**
 * Formats the monthly price of the subscription (even for yearly subscriptions).
 */
export function formatMonthlyPrice(subscriptionPrice: number, paymentInterval: PaymentInterval): string {
	const monthlyPrice = paymentInterval === PaymentInterval.Yearly ? subscriptionPrice / Number(PaymentInterval.Yearly) : subscriptionPrice
	return formatPrice(monthlyPrice, true)
}

export function formatPriceWithInfo(price: number, paymentInterval: PaymentInterval, taxIncluded: boolean): string {
	const netOrGross = taxIncluded ? lang.get("gross_label") : lang.get("net_label")
	const yearlyOrMonthly = paymentInterval === PaymentInterval.Yearly ? lang.get("pricing.perYear_label") : lang.get("pricing.perMonth_label")
	const formattedPrice = formatPrice(price, true)
	return `${formattedPrice} ${yearlyOrMonthly} (${netOrGross})`
}

/**
 * Provides the price item from the given priceData for the given featureType. Returns null if no such item is available.
 */
export function getPriceItem(priceData: PriceData | null, featureType: NumberString): PriceItemData | null {
	return priceData?.items.find((item) => item.featureType === featureType) ?? null
}

export function getCountFromPriceData(priceData: PriceData | null, featureType: BookingItemFeatureType): number {
	const priceItem = getPriceItem(priceData, featureType)
	return priceItem ? Number(priceItem.count) : 0
}

/**
 * Returns the price for the feature type from the price data if available. otherwise 0.
 * @return The price
 */
export function getPriceFromPriceData(priceData: PriceData | null, featureType: NumberString): number {
	let item = getPriceItem(priceData, featureType)

	if (item) {
		return Number(item.price)
	} else {
		return 0
	}
}

const SUBSCRIPTION_CONFIG_RESOURCE_URL = "https://tutanota.com/resources/data/subscriptions.json"

export class PriceAndConfigProvider {
	private upgradePriceData: UpgradePriceServiceReturn | null = null
	private planPrices: SubscriptionPlanPrices | null = null

	private possibleSubscriptionList: { [K in SubscriptionName]: SubscriptionConfig } | null = null

	private constructor() {}

	private async init(registrationDataId: string | null, serviceExecutor: IServiceExecutor): Promise<void> {
		const data = createUpgradePriceServiceData({
			date: Const.CURRENT_DATE,
			campaign: registrationDataId,
		})
		this.upgradePriceData = await serviceExecutor.get(UpgradePriceService, data)
		this.planPrices = {
			[PaidSubscriptionType.Premium]: this.upgradePriceData.premiumPrices,
			[PaidSubscriptionType.PremiumBusiness]: this.upgradePriceData.premiumBusinessPrices,
			[PaidSubscriptionType.Teams]: this.upgradePriceData.teamsPrices,
			[PaidSubscriptionType.TeamsBusiness]: this.upgradePriceData.teamsBusinessPrices,
			[PaidSubscriptionType.Pro]: this.upgradePriceData.proPrices,
			[PaidSubscriptionType.Revolutionary]: this.upgradePriceData.revolutionaryPrices,
			[PaidSubscriptionType.Legend]: this.upgradePriceData.legendaryPrices,
			[PaidSubscriptionType.Essential]: this.upgradePriceData.essentialPrices,
			[PaidSubscriptionType.Advanced]: this.upgradePriceData.advancedPrices,
			[PaidSubscriptionType.Unlimited]: this.upgradePriceData.unlimitedPrices,
		}

		if ("undefined" === typeof fetch) return
		try {
			this.possibleSubscriptionList = await (await fetch(SUBSCRIPTION_CONFIG_RESOURCE_URL)).json()
		} catch (e) {
			console.log("failed to fetch subscription list:", e)
			throw new ConnectionError("failed to fetch subscription list")
		}
	}

	static async getInitializedInstance(
		registrationDataId: string | null,
		serviceExecutor: IServiceExecutor = locator.serviceExecutor,
	): Promise<PriceAndConfigProvider> {
		const priceDataProvider = new PriceAndConfigProvider()
		await priceDataProvider.init(registrationDataId, serviceExecutor)
		return priceDataProvider
	}

	getSubscriptionPrice(paymentInterval: PaymentInterval, subscription: PaidSubscriptionType | null, type: UpgradePriceType): number {
		if (subscription == null) return 0
		return paymentInterval === PaymentInterval.Yearly
			? this.getYearlySubscriptionPrice(subscription, type)
			: this.getMonthlySubscriptionPrice(subscription, type)
	}

	getRawPricingData(): UpgradePriceServiceReturn {
		return assertNotNull(this.upgradePriceData)
	}

	getSubscriptionConfig(targetSubscription: PaidSubscriptionType): SubscriptionConfig {
		return assertNotNull(this.possibleSubscriptionList)[targetSubscription]
	}

	private getSubscriptionTypeMapping(featureType: BookingItemFeatureType): SubscriptionType | null {
		switch (featureType) {
			case BookingItemFeatureType.Revolutionary:
				return SubscriptionType.Revolutionary
			case BookingItemFeatureType.Legend:
				return SubscriptionType.Legend
			case BookingItemFeatureType.Essential:
				return SubscriptionType.Essential
			case BookingItemFeatureType.Advanced:
				return SubscriptionType.Advanced
			case BookingItemFeatureType.Unlimited:
				return SubscriptionType.Unlimited
			default:
				return null
		}
	}

	private getYearlySubscriptionPrice(subscription: PaidSubscriptionType, upgrade: UpgradePriceType): number {
		const prices = this.getPlanPrices(subscription)
		const monthlyPrice = getPriceForUpgradeType(upgrade, prices)
		const monthsFactor = upgrade === UpgradePriceType.PlanReferencePrice ? Number(PaymentInterval.Yearly) : 10
		const discount = upgrade === UpgradePriceType.PlanActualPrice ? Number(prices.firstYearDiscount) : 0
		return monthlyPrice * monthsFactor - discount
	}

	private getMonthlySubscriptionPrice(subscription: PaidSubscriptionType, upgrade: UpgradePriceType): number {
		const prices = this.getPlanPrices(subscription)
		return getPriceForUpgradeType(upgrade, prices)
	}

	private getPlanPrices(subscription: PaidSubscriptionType | null): WebsitePlanPrices {
		if (subscription == null) {
			return {
				additionalUserPriceMonthly: "0",
				contactFormPriceMonthly: "0",
				firstYearDiscount: "0",
				monthlyPrice: "0",
				monthlyReferencePrice: "0",
			}
		}
		return assertNotNull(this.planPrices)[subscription]
	}
}

function getPriceForUpgradeType(upgrade: UpgradePriceType, prices: WebsitePlanPrices): number {
	switch (upgrade) {
		case UpgradePriceType.PlanReferencePrice:
			return Number(prices.monthlyReferencePrice)
		case UpgradePriceType.PlanActualPrice:
		case UpgradePriceType.PlanNextYearsPrice:
			return Number(prices.monthlyPrice)
		case UpgradePriceType.AdditionalUserPrice:
			return Number(prices.additionalUserPriceMonthly)
		case UpgradePriceType.ContactFormPrice:
			return Number(prices.contactFormPriceMonthly)
	}
}

function descendingSubscriptionOrder(): Array<PaidSubscriptionType> {
	return [
		PaidSubscriptionType.Unlimited,
		PaidSubscriptionType.Advanced,
		PaidSubscriptionType.Legend,
		PaidSubscriptionType.Essential,
		PaidSubscriptionType.Revolutionary,
	]
}

/**
 * Returns true if the targetSubscription plan is considered to be a lower (~ cheaper) subscription plan
 * Is based on the order of business and non-business subscriptions as defined in descendingSubscriptionOrder
 */
export function isSubscriptionDowngrade(targetSubscription: PaidSubscriptionType, currentSubscription: PaidSubscriptionType | null): boolean {
	const order = descendingSubscriptionOrder()
	if (Object.values(SubscriptionType).includes(downcast(currentSubscription))) {
		return order.indexOf(targetSubscription) > order.indexOf(downcast(currentSubscription))
	} else {
		return false
	}
}
