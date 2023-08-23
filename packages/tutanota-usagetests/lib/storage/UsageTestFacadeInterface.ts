import { Stage } from "../model/Stage.js"
import { UsageTest } from "../model/UsageTest.js"

export interface UsageTestFacadeInterface {
	sendPing(test: UsageTest, stage: Stage): Promise<void>
	setOptInDecision(decision: boolean): Promise<void>
	doLoadActiveUsageTests(): Promise<UsageTest[]>

	updateCustomerProperties(): Promise<void>
}
