import { EntityUpdateData, EventController, isUpdateForTypeRef } from "../api/main/EventController.js"
import { CustomerPropertiesTypeRef } from "../api/entities/sys/TypeRefs.js"
import { UserSettingsGroupRootTypeRef } from "../api/entities/tutanota/TypeRefs.js"
import { LoginController } from "../api/main/LoginController.js"
import { UsageTestFacade } from "../api/worker/facades/UsageTestFacade.js"
import { UsageTest } from "@tutao/tutanota-usagetests"
import { ObsoleteUsageTest } from "@tutao/tutanota-usagetests/dist/model/UsageTest.js"

/** Centralized place which holds all the {@link UsageTest}s. */
export class UsageTestController {
	private readonly tests: Map<string, UsageTest> = new Map<string, UsageTest>()
	private readonly obsoleteUsageTest = new ObsoleteUsageTest("obsolete", "obsolete", 0)

	constructor(
		private readonly usageTestFacade: UsageTestFacade,
		private readonly eventController: EventController,
		private readonly loginController: LoginController,
	) {
		eventController.addEntityListener((updates: ReadonlyArray<EntityUpdateData>) => {
			return this.entityEventsReceived(updates)
		})
	}

	/**
	 * Sets the user's usage data opt-in decision. True means they opt in.
	 *
	 * Immediately refetches the user's active usage tests if they opted in.
	 */
	public async setOptInDecision(decision: boolean) {
		await this.usageTestFacade.setOptInDecision(decision)

		if (decision) {
			const tests: UsageTest[] = await this.usageTestFacade.doLoadActiveUsageTests()
			this.setTests(tests)
		}
	}

	async entityEventsReceived(updates: ReadonlyArray<EntityUpdateData>) {
		for (const update of updates) {
			if (isUpdateForTypeRef(CustomerPropertiesTypeRef, update)) {
				await this.usageTestFacade.updateCustomerProperties()
			} else if (isUpdateForTypeRef(UserSettingsGroupRootTypeRef, update)) {
				const updatedOptInDecision = this.loginController.getUserController().userSettingsGroupRoot.usageDataOptedIn

				if ((await this.usageTestFacade.getOptInDecision()) === updatedOptInDecision) {
					return
				}

				// Opt-in decision has changed, load tests
				const tests: UsageTest[] = await this.usageTestFacade.loadActiveUsageTests()
				this.setTests(tests)
				if (updatedOptInDecision != null) {
					await this.usageTestFacade.setOptInDecision(updatedOptInDecision)
				}
			}
		}
	}

	addTest(test: UsageTest) {
		test.pingAdapter = this.usageTestFacade
		this.tests.set(test.testId, test)
	}

	addTests(tests: UsageTest[]) {
		for (let test of tests) {
			this.addTest(test)
		}
	}

	setTests(tests: UsageTest[]) {
		this.tests.clear()

		this.addTests(tests)
	}

	/**
	 * Searches a test first by its ID and then, if no match is found, by its name.
	 * If no test matches by name either, then we assume that the test is finished and the server no longer sends assignments for it.
	 * In that case, we want to render the no-participation variant, so a sham test instance needs to be returned.
	 *
	 * @param testIdOrName The test's ID or its name
	 */
	getTest(testIdOrName: string): UsageTest {
		let result = this.tests.get(testIdOrName)

		if (result) {
			return result
		}

		for (let test of this.tests.values()) {
			if (test.testName === testIdOrName) {
				return test
			}
		}

		console.log(`Test '${testIdOrName}' not found, using obsolete...`)
		return this.obsoleteUsageTest
	}

	/**
	 * some components are used in multiple places, but only want to do a test in one of them.
	 * use this to get a test that always renders variant 0 and doesn't send pings.
	 */
	getObsoleteTest(): UsageTest {
		return this.obsoleteUsageTest
	}

	/**
	 * only for usage from the console. may have unintended consequences when used too early or too late.
	 * @param test the name of the test to change the variant on
	 * @param variant the number of the variant to use from here on
	 */
	private setVariant(test: string, variant: number) {
		this.getTest(test).variant = variant
	}

	showOptInIndicator() {
		return this.usageTestFacade.showOptInIndicator()
	}
}
