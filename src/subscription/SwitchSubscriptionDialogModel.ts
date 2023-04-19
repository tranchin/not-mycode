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
import { BookingItemFeatureType, SubscriptionType } from "../api/common/TutanotaConstants"
import { neverNull } from "@tutao/tutanota-utils"
import type { AccountingInfo, Booking, Customer, CustomerInfo, PriceServiceReturn } from "../api/entities/sys/TypeRefs.js"
import { asPaymentInterval, getPriceFromPriceData, getPriceItem, PaymentInterval } from "./PriceUtils"
import type { BookingFacade } from "../api/worker/facades/lazy/BookingFacade.js"
import { SubscriptionConfig } from "./FeatureListProvider"

type PlanPriceCalc = {
	monthlyPrice: number
	additionalUserPriceMonthly: number
	includedAliases: number
	includedStorage: number
	readonly targetIsDowngrade: boolean
	readonly targetSubscription: SubscriptionType
	readonly targetSubscriptionConfig: SubscriptionConfig
	readonly paymentIntervalFactor: number
}
export type CurrentSubscriptionInfo = {
	businessUse: boolean
	nbrOfUsers: number
	subscriptionType: SubscriptionType
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
		private readonly subscriptionType: SubscriptionType,
	) {
		this.currentSubscriptionInfo = this._initCurrentSubscriptionInfo()
	}

	_initCurrentSubscriptionInfo(): CurrentSubscriptionInfo {
		const paymentInterval: PaymentInterval = asPaymentInterval(this.accountingInfo.paymentInterval)
		return {
			businessUse: !!this.customer.businessUse,
			subscriptionType: this.subscriptionType,
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

export function isUpgradeAliasesNeeded(targetSubscriptionConfig: SubscriptionConfig, currentNbrOfAliases: number): boolean {
	return currentNbrOfAliases < targetSubscriptionConfig.nbrOfAliases
}

export function isDowngradeAliasesNeeded(targetSubscriptionConfig: SubscriptionConfig, currentNbrOfAliases: number, includedAliases: number): boolean {
	// only order the target aliases package if it is smaller than the actual number of current aliases and if we have currently ordered more than the included aliases
	return currentNbrOfAliases > targetSubscriptionConfig.nbrOfAliases && currentNbrOfAliases > includedAliases
}

export function isUpgradeStorageNeeded(targetSubscriptionConfig: SubscriptionConfig, currentAmountOfStorage: number): boolean {
	return currentAmountOfStorage < targetSubscriptionConfig.storageGb
}

export function isDowngradeStorageNeeded(targetSubscriptionConfig: SubscriptionConfig, currentAmountOfStorage: number, includedStorage: number): boolean {
	return currentAmountOfStorage > targetSubscriptionConfig.storageGb && currentAmountOfStorage > includedStorage
}

export function isUpgradeSharingNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlySharingOrdered: boolean): boolean {
	return !currentlySharingOrdered && targetSubscriptionConfig.sharing
}

export function isDowngradeSharingNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlySharingOrdered: boolean): boolean {
	return currentlySharingOrdered && !targetSubscriptionConfig.sharing
}

export function isUpgradeBusinessNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlyBusinessOrdered: boolean): boolean {
	return !currentlyBusinessOrdered && targetSubscriptionConfig.business
}

export function isDowngradeBusinessNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlyBusinessOrdered: boolean): boolean {
	return currentlyBusinessOrdered && !targetSubscriptionConfig.business
}

export function isUpgradeWhitelabelNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlyWhitelabelOrdered: boolean): boolean {
	return !currentlyWhitelabelOrdered && targetSubscriptionConfig.whitelabel
}

export function isDowngradeWhitelabelNeeded(targetSubscriptionConfig: SubscriptionConfig, currentlyWhitelabelOrdered: boolean): boolean {
	return currentlyWhitelabelOrdered && !targetSubscriptionConfig.whitelabel
}

function calcWhitelabelFeature(
	planPrices: PlanPriceCalc,
	currentlyWhitelabelOrdered: boolean,
	currentWhitelabelPerUserMonthly: number,
	upgradeWhitelabelPrice: PriceServiceReturn,
	downgradeWhitelabelPrice: PriceServiceReturn,
): void {
	const { targetSubscriptionConfig, targetIsDowngrade, paymentIntervalFactor } = planPrices

	if (isUpgradeWhitelabelNeeded(targetSubscriptionConfig, currentlyWhitelabelOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(upgradeWhitelabelPrice.futurePriceNextPeriod).price) - Number(neverNull(upgradeWhitelabelPrice.currentPriceNextPeriod).price)
		planPrices.additionalUserPriceMonthly += getMonthlySinglePrice(upgradeWhitelabelPrice, BookingItemFeatureType.Whitelabel, paymentIntervalFactor)
	} else if (targetIsDowngrade && isDowngradeWhitelabelNeeded(targetSubscriptionConfig, currentlyWhitelabelOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(downgradeWhitelabelPrice.futurePriceNextPeriod).price) - Number(neverNull(downgradeWhitelabelPrice.currentPriceNextPeriod).price)
	} else {
		planPrices.additionalUserPriceMonthly += currentWhitelabelPerUserMonthly
	}
}

function calcSharingFeature(
	planPrices: PlanPriceCalc,
	currentlySharingOrdered: boolean,
	currentSharingPerUserMonthly: number,
	upgradeSharingPrice: PriceServiceReturn,
	downgradeSharingPrice: PriceServiceReturn,
): void {
	const { targetSubscriptionConfig, targetIsDowngrade, paymentIntervalFactor } = planPrices

	if (isUpgradeSharingNeeded(targetSubscriptionConfig, currentlySharingOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(upgradeSharingPrice.futurePriceNextPeriod).price) - Number(neverNull(upgradeSharingPrice.currentPriceNextPeriod).price)
		planPrices.additionalUserPriceMonthly += getMonthlySinglePrice(upgradeSharingPrice, BookingItemFeatureType.Sharing, paymentIntervalFactor)
	} else if (targetIsDowngrade && isDowngradeSharingNeeded(targetSubscriptionConfig, currentlySharingOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(downgradeSharingPrice.futurePriceNextPeriod).price) - Number(neverNull(downgradeSharingPrice.currentPriceNextPeriod).price)
	} else {
		planPrices.additionalUserPriceMonthly += currentSharingPerUserMonthly
	}
}

function calcBusinessFeature(
	planPrices: PlanPriceCalc,
	currentlyBusinessOrdered: boolean,
	currentBusinessPerUserMonthly: number,
	upgradeBusinessPrice: PriceServiceReturn,
	downgradeBusinessPrice: PriceServiceReturn,
): void {
	const { targetSubscriptionConfig, targetIsDowngrade, paymentIntervalFactor } = planPrices

	if (isUpgradeBusinessNeeded(targetSubscriptionConfig, currentlyBusinessOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(upgradeBusinessPrice.futurePriceNextPeriod).price) - Number(neverNull(upgradeBusinessPrice.currentPriceNextPeriod).price)
		planPrices.additionalUserPriceMonthly += getMonthlySinglePrice(upgradeBusinessPrice, BookingItemFeatureType.Business, paymentIntervalFactor)
	} else if (targetIsDowngrade && isDowngradeBusinessNeeded(targetSubscriptionConfig, currentlyBusinessOrdered)) {
		planPrices.monthlyPrice +=
			Number(neverNull(downgradeBusinessPrice.futurePriceNextPeriod).price) - Number(neverNull(downgradeBusinessPrice.currentPriceNextPeriod).price)
	} else {
		planPrices.additionalUserPriceMonthly += currentBusinessPerUserMonthly
	}
}

function calcStorage(
	planPrices: PlanPriceCalc,
	currentTotalStorage: number,
	includedStorage: number,
	upgrade10GbStoragePrice: PriceServiceReturn,
	downgrade1GbStoragePrice: PriceServiceReturn,
): void {
	const { targetIsDowngrade, targetSubscriptionConfig } = planPrices

	if (isUpgradeStorageNeeded(targetSubscriptionConfig, currentTotalStorage)) {
		planPrices.monthlyPrice +=
			Number(neverNull(upgrade10GbStoragePrice.futurePriceNextPeriod).price) - Number(neverNull(upgrade10GbStoragePrice.currentPriceNextPeriod).price)
	} else if (targetIsDowngrade && isDowngradeStorageNeeded(targetSubscriptionConfig, currentTotalStorage, includedStorage)) {
		planPrices.monthlyPrice +=
			Number(neverNull(downgrade1GbStoragePrice.futurePriceNextPeriod).price) - Number(neverNull(downgrade1GbStoragePrice.currentPriceNextPeriod).price)
	}

	const targetAmountStorage = targetSubscriptionConfig.storageGb
	planPrices.includedStorage = !targetIsDowngrade ? Math.max(currentTotalStorage, targetAmountStorage) : targetAmountStorage
}

function calcAliases(
	planPrices: PlanPriceCalc,
	currentTotalAliases: number,
	includedAliases: number,
	upgrade20AliasesPrice: PriceServiceReturn,
	downgrade5AliasesPrice: PriceServiceReturn,
): void {
	const { targetSubscriptionConfig, targetIsDowngrade } = planPrices

	if (isUpgradeAliasesNeeded(targetSubscriptionConfig, currentTotalAliases)) {
		planPrices.monthlyPrice +=
			Number(neverNull(upgrade20AliasesPrice.futurePriceNextPeriod).price) - Number(neverNull(upgrade20AliasesPrice.currentPriceNextPeriod).price)
	} else if (targetIsDowngrade && isDowngradeAliasesNeeded(targetSubscriptionConfig, currentTotalAliases, includedAliases)) {
		planPrices.monthlyPrice +=
			Number(neverNull(downgrade5AliasesPrice.futurePriceNextPeriod).price) - Number(neverNull(downgrade5AliasesPrice.currentPriceNextPeriod).price)
	}

	const targetNbrAliases = targetSubscriptionConfig.nbrOfAliases
	planPrices.includedAliases = !targetIsDowngrade ? Math.max(currentTotalAliases, targetNbrAliases) : targetNbrAliases
}

function getMonthlySinglePrice(priceData: PriceServiceReturn, featureType: NumberString, additionalFactor: number): number {
	let futurePrice = getPriceFromPriceData(priceData.futurePriceNextPeriod, featureType)
	const item = getPriceItem(priceData.futurePriceNextPeriod, featureType)

	if (item && item.singleType) {
		futurePrice /= Number(item.count)
		return Number((futurePrice * additionalFactor).toFixed(2))
	} else {
		return 0 // total prices do not change
	}
}
