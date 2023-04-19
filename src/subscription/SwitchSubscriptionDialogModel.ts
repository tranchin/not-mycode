import {
	getIncludedAliases,
	getIncludedStorageCapacity,
	getNbrOfContactForms,
	getNbrOfUsers,
	getTotalAliases,
	getTotalStorageCapacity,
	isBusinessFeatureActive,
	isSharingActive,
	isWhitelabelActive,
} from "./SubscriptionUtils"
import { PlanType } from "../api/common/TutanotaConstants"
import type { AccountingInfo, Booking, Customer, CustomerInfo, PlanPrices, PriceServiceReturn } from "../api/entities/sys/TypeRefs.js"
import { asPaymentInterval, PaymentInterval } from "./PriceUtils"
import type { BookingFacade } from "../api/worker/facades/lazy/BookingFacade.js"
import { SubscriptionConfig } from "./FeatureListProvider"

type PlanPriceCalc = {
	monthlyPrice: number
	additionalUserPriceMonthly: number
	includedAliases: number
	includedStorage: number
	readonly targetIsDowngrade: boolean
	readonly targetSubscription: PlanType
	readonly targetSubscriptionConfig: SubscriptionConfig
	readonly paymentIntervalFactor: number
}
export type CurrentSubscriptionInfo = {
	businessUse: boolean
	nbrOfUsers: number
	planType: PlanType
	paymentInterval: PaymentInterval
	currentTotalStorage: number
	currentTotalAliases: number
	orderedContactForms: number
	includedStorage: number
	includedAliases: number
	currentlyWhitelabelOrdered: boolean
	currentlySharingOrdered: boolean
	currentlyBusinessOrdered: boolean
}
export type UpgradeDowngradePrices = {
	addUserPrice: PriceServiceReturn
	upgrade20AliasesPrice: PriceServiceReturn
	downgrade5AliasesPrice: PriceServiceReturn
	upgrade10GbStoragePrice: PriceServiceReturn
	downgrade1GbStoragePrice: PriceServiceReturn
	upgradeSharingPrice: PriceServiceReturn
	downgradeSharingPrice: PriceServiceReturn
	upgradeBusinessPrice: PriceServiceReturn
	downgradeBusinessPrice: PriceServiceReturn
	upgradeWhitelabelPrice: PriceServiceReturn
	downgradeWhitelabelPrice: PriceServiceReturn
	contactFormPrice: PriceServiceReturn
}

export class SwitchSubscriptionDialogModel {
	currentSubscriptionInfo: CurrentSubscriptionInfo

	constructor(
		private readonly bookingFacade: BookingFacade,
		private readonly customer: Customer,
		private readonly customerInfo: CustomerInfo,
		private readonly accountingInfo: AccountingInfo,
		private readonly lastBooking: Booking,
		private readonly planType: PlanType,
	) {
		this.currentSubscriptionInfo = this._initCurrentSubscriptionInfo()
	}

	_initCurrentSubscriptionInfo(): CurrentSubscriptionInfo {
		const paymentInterval: PaymentInterval = asPaymentInterval(this.accountingInfo.paymentInterval)
		return {
			businessUse: !!this.customer.businessUse,
			planType: this.planType,
			nbrOfUsers: getNbrOfUsers(this.lastBooking),
			paymentInterval,
			currentTotalStorage: getTotalStorageCapacity(this.customer, this.customerInfo, this.lastBooking),
			currentTotalAliases: getTotalAliases(this.customer, this.customerInfo, this.lastBooking),
			includedStorage: getIncludedStorageCapacity(this.customerInfo),
			includedAliases: getIncludedAliases(this.customerInfo),
			currentlyWhitelabelOrdered: isWhitelabelActive(this.lastBooking),
			currentlySharingOrdered: isSharingActive(this.lastBooking),
			currentlyBusinessOrdered: isBusinessFeatureActive(this.lastBooking),
			orderedContactForms: getNbrOfContactForms(this.lastBooking),
		}
	}
}

export function isUpgradeAliasesNeeded(targetSubscriptionConfig: PlanPrices, currentNbrOfAliases: number): boolean {
	return currentNbrOfAliases < Number(targetSubscriptionConfig.includedAliases)
}

export function isDowngradeAliasesNeeded(targetSubscriptionConfig: PlanPrices, currentNbrOfAliases: number, includedAliases: number): boolean {
	// only order the target aliases package if it is smaller than the actual number of current aliases and if we have currently ordered more than the included aliases
	return currentNbrOfAliases > Number(targetSubscriptionConfig.includedAliases) && currentNbrOfAliases > includedAliases
}

export function isUpgradeStorageNeeded(targetSubscriptionConfig: PlanPrices, currentAmountOfStorage: number): boolean {
	return currentAmountOfStorage < Number(targetSubscriptionConfig.includedStorage)
}

export function isDowngradeStorageNeeded(targetSubscriptionConfig: PlanPrices, currentAmountOfStorage: number, includedStorage: number): boolean {
	return currentAmountOfStorage > Number(targetSubscriptionConfig.includedStorage) && currentAmountOfStorage > includedStorage
}

export function isUpgradeSharingNeeded(targetSubscriptionConfig: PlanPrices, currentlySharingOrdered: boolean): boolean {
	return !currentlySharingOrdered && targetSubscriptionConfig.sharing
}

export function isDowngradeSharingNeeded(targetSubscriptionConfig: PlanPrices, currentlySharingOrdered: boolean): boolean {
	return currentlySharingOrdered && !targetSubscriptionConfig.sharing
}

export function isUpgradeBusinessNeeded(targetSubscriptionConfig: PlanPrices, currentlyBusinessOrdered: boolean): boolean {
	return !currentlyBusinessOrdered && targetSubscriptionConfig.business
}

export function isDowngradeBusinessNeeded(targetSubscriptionConfig: PlanPrices, currentlyBusinessOrdered: boolean): boolean {
	return currentlyBusinessOrdered && !targetSubscriptionConfig.business
}

export function isUpgradeWhitelabelNeeded(targetSubscriptionConfig: PlanPrices, currentlyWhitelabelOrdered: boolean): boolean {
	return !currentlyWhitelabelOrdered && targetSubscriptionConfig.whitelabel
}

export function isDowngradeWhitelabelNeeded(targetSubscriptionConfig: PlanPrices, currentlyWhitelabelOrdered: boolean): boolean {
	return currentlyWhitelabelOrdered && !targetSubscriptionConfig.whitelabel
}
