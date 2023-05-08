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
import type { AccountingInfo, Booking, Customer, CustomerInfo } from "../api/entities/sys/TypeRefs.js"
import { asPaymentInterval, PaymentInterval } from "./PriceUtils"
import type { BookingFacade } from "../api/worker/facades/lazy/BookingFacade.js"

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
			businessUse: this.customer.businessUse,
			planType: this.planType,
			nbrOfUsers: getNbrOfUsers(this.lastBooking),
			paymentInterval,
			currentTotalStorage: getTotalStorageCapacity(this.customer, this.customerInfo, this.lastBooking),
			currentTotalAliases: getTotalAliases(this.customer, this.customerInfo, this.lastBooking),
			includedStorage: getIncludedStorageCapacity(this.customerInfo),
			includedAliases: getIncludedAliases(this.customerInfo),
			currentlyWhitelabelOrdered: isWhitelabelActive(this.lastBooking, this.customerInfo),
			currentlySharingOrdered: isSharingActive(this.lastBooking),
			currentlyBusinessOrdered: isBusinessFeatureActive(this.lastBooking),
			orderedContactForms: getNbrOfContactForms(this.lastBooking),
		}
	}
}
