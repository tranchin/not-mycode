import { PlanType } from "../api/common/TutanotaConstants"
import type { AccountingInfo, Customer } from "../api/entities/sys/TypeRefs.js"
import { asPaymentInterval, PaymentInterval } from "./PriceUtils"

export type CurrentSubscriptionInfo = {
	businessUse: boolean
	planType: PlanType
	paymentInterval: PaymentInterval
}

export class SwitchSubscriptionDialogModel {
	currentSubscriptionInfo: CurrentSubscriptionInfo

	constructor(private readonly customer: Customer, private readonly accountingInfo: AccountingInfo, private readonly planType: PlanType) {
		this.currentSubscriptionInfo = this._initCurrentSubscriptionInfo()
	}

	_initCurrentSubscriptionInfo(): CurrentSubscriptionInfo {
		const paymentInterval: PaymentInterval = asPaymentInterval(this.accountingInfo.paymentInterval)
		return {
			businessUse: this.customer.businessUse,
			planType: this.planType,
			paymentInterval,
		}
	}
}
