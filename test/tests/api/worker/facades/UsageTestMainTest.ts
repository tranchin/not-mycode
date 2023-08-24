import o from "@tutao/otest"
import { matchers, object, when } from "testdouble"
import { EventController } from "../../../../../src/api/main/EventController.js"
import { LoginController } from "../../../../../src/api/main/LoginController.js"
import { UsageTestFacade } from "../../../../../src/api/worker/facades/UsageTestFacade.js"
import { Stage, UsageTest } from "@tutao/tutanota-usagetests"
import { UsageTestController } from "../../../../../src/misc/UsageTestController.js"

o.spec("Main", function () {
	const eventController = object<EventController>()
	const logins = object<LoginController>()
	o("dom render variant", function () {
		const testId = "t123"
		const test = new UsageTest(testId, "test 123", 0, true)
		test.pingAdapter = makeUsageTestFacadeMock().usageTestFacade

		const rendered = test.renderVariant({
			[0]: () => 0,
			[1]: () => 1,
		})

		o(rendered).equals(0)
	})

	o("complete stage and send ping", async function () {
		const testId = "t123"
		const usageTestFacadeWrapper = makeUsageTestFacadeMock()

		const test = new UsageTest(testId, "test 123", 2, true)
		test.pingAdapter = usageTestFacadeWrapper.usageTestFacade

		const stage0 = new Stage(0, test, 1, 1)
		await stage0.complete()

		o(usageTestFacadeWrapper.pingsSent).equals(1)
	})

	o("add tests to and retrieve from usage test controller", function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 0, true)

		const testId2 = "t2"
		const test2 = new UsageTest(testId2, "test 2", 1, true)

		const usageTestFacade = makeUsageTestFacadeMock().usageTestFacade
		const usageTestController = new UsageTestController(usageTestFacade, eventController, logins)

		usageTestController.addTests([test1, test2])

		// Correctly injected usageTestFacade
		o(usageTestController.getTest(testId1).pingAdapter).equals(usageTestFacade)

		o(usageTestController.getTest(testId2)).equals(test2)
	})

	o("pings are only sent once if minPings=maxPings=1", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)

		for (let i = 0; i < 3; i++) {
			test1.addStage(new Stage(i, test1, 1, 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(0).complete() // 1
		await test1.getStage(0).complete() // 1
		await test1.getStage(1).complete() // 2
		await test1.getStage(1).complete() // 2
		await test1.getStage(1).complete() // 2
		await test1.getStage(0).complete() // 2
		await test1.getStage(2).complete() // 3
		await test1.getStage(1).complete() // 3
		await test1.getStage(2).complete() // 3

		o(usageTestFacadeMock.pingsSent).equals(3)
	})

	o("test may be restarted upon reaching the last stage", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)

		for (let i = 0; i < 3; i++) {
			test1.addStage(new Stage(i, test1, 1, 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(0).complete() // 1
		await test1.getStage(0).complete() // 1
		await test1.getStage(1).complete() // 2
		await test1.getStage(1).complete() // 2
		await test1.getStage(1).complete() // 2
		await test1.getStage(0).complete() // 2
		await test1.getStage(2).complete() // 3
		await test1.getStage(1).complete() // 3
		await test1.getStage(2).complete() // 3
		await test1.getStage(0).complete() // 4
		await test1.getStage(1).complete() // 5

		o(usageTestFacadeMock.pingsSent).equals(5)
	})

	o("test may be restarted before reaching the last stage if allowEarlyRestarts=true", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)
		test1.allowEarlyRestarts = true

		for (let i = 0; i < 3; i++) {
			test1.addStage(new Stage(i, test1, 1, 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(0).complete() // 1
		await test1.getStage(0).complete() // 2
		await test1.getStage(1).complete() // 3
		await test1.getStage(1).complete() // 3
		await test1.getStage(1).complete() // 3
		await test1.getStage(0).complete() // 4
		await test1.getStage(2).complete() // 4
		await test1.getStage(1).complete() // 5
		await test1.getStage(2).complete() // 6
		await test1.getStage(0).complete() // 7
		await test1.getStage(1).complete() // 8

		o(usageTestFacadeMock.pingsSent).equals(8)
	})

	o("stages may be repeated if configured as such", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)

		for (let i = 0; i < 3; i++) {
			test1.addStage(new Stage(i, test1, 1, i + 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(0).complete() // 1
		await test1.getStage(0).complete() // 1
		await test1.getStage(1).complete() // 2
		await test1.getStage(1).complete() // 3
		await test1.getStage(1).complete() // 4
		await test1.getStage(0).complete() // 4
		await test1.getStage(2).complete() // 5
		await test1.getStage(1).complete() // 5
		await test1.getStage(2).complete() // 5
		await test1.getStage(0).complete() // 6
		await test1.getStage(1).complete() // 7
		await test1.getStage(1).complete() // 8
		await test1.getStage(2).complete() // 9
		await test1.getStage(2).complete() // 10
		await test1.getStage(2).complete() // 11
		await test1.getStage(2).complete() // 11

		o(usageTestFacadeMock.pingsSent).equals(11)
	})

	o("stages may be skipped if configured as such", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)

		for (let i = 0; i < 3; i++) {
			test1.addStage(new Stage(i, test1, 0, i + 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(2).complete() // 1
		await test1.getStage(1).complete() // 1
		await test1.getStage(2).complete() // 2
		await test1.getStage(0).complete() // 3
		await test1.getStage(1).complete() // 4
		await test1.getStage(1).complete() // 5
		await test1.getStage(2).complete() // 6
		await test1.getStage(2).complete() // 7
		await test1.getStage(2).complete() // 8
		await test1.getStage(2).complete() // 8

		o(usageTestFacadeMock.pingsSent).equals(8)
	})

	o("stages may be skipped if configured as such, 2", async function () {
		const testId1 = "t1"
		const test1 = new UsageTest(testId1, "test 1", 1, true)
		test1.allowEarlyRestarts = true

		for (let i = 0; i < 4; i++) {
			test1.addStage(new Stage(i, test1, i == 2 ? 0 : 1, i + 1))
		}

		const usageTestFacadeMock = makeUsageTestFacadeMock()
		const usageTestController = new UsageTestController(usageTestFacadeMock.usageTestFacade, eventController, logins)

		usageTestController.addTests([test1])

		await test1.getStage(0).complete() // 1
		await test1.getStage(0).complete() // 2
		await test1.getStage(0).complete() // 3
		await test1.getStage(0).complete() // 4
		await test1.getStage(2).complete() // 4
		await test1.getStage(2).complete() // 4
		await test1.getStage(0).complete() // 5
		await test1.getStage(1).complete() // 6
		await test1.getStage(1).complete() // 7
		await test1.getStage(3).complete() // 8

		o(usageTestFacadeMock.pingsSent).equals(8)
	})
})

function makeUsageTestFacadeMock(): { pingsSent: number; usageTestFacade: UsageTestFacade } {
	let pingsSent = 0
	const usageTestFacade = object<UsageTestFacade>()
	when(usageTestFacade.sendPing(matchers.anything(), matchers.anything())).thenDo(() => pingsSent++)
	return {
		pingsSent,
		usageTestFacade,
	}
}

const result = await o.run()
o.printReport(result)
o.terminateProcess(result)
