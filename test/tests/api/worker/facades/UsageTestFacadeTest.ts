import o from "@tutao/otest"
import {
	ASSIGNMENT_UPDATE_INTERVAL_MS,
	EphemeralUsageTestStorage,
	PersistedAssignmentData,
	StorageBehavior,
	UsageTestFacade,
	UsageTestStorage,
} from "../../../../../src/api/worker/facades/UsageTestFacade.js"
import {
	createUsageTestAssignment,
	createUsageTestAssignmentIn,
	createUsageTestAssignmentOut,
	createUsageTestMetricData,
	createUsageTestParticipationIn,
} from "../../../../../src/api/entities/usage/TypeRefs.js"
import { matchers, object, replace, verify, when } from "testdouble"
import { clone } from "@tutao/tutanota-utils"
import { SuspensionBehavior } from "../../../../../src/api/worker/rest/RestClient.js"
import { UsageTestAssignmentService, UsageTestParticipationService } from "../../../../../src/api/entities/usage/Services.js"
import { IServiceExecutor } from "../../../../../src/api/common/ServiceRequest.js"
import modelInfo from "../../../../../src/api/entities/usage/ModelInfo.js"
import { EntityClient } from "../../../../../src/api/common/EntityClient.js"
import { createCustomerProperties } from "../../../../../src/api/entities/sys/TypeRefs.js"
import { createUserSettingsGroupRoot, UserSettingsGroupRootTypeRef } from "../../../../../src/api/entities/tutanota/TypeRefs.js"
import { UserFacade } from "../../../../../src/api/worker/facades/UserFacade.js"
import { Stage, UsageTest } from "@tutao/tutanota-usagetests"

const { anything } = matchers

o.spec("UsageTestFacade", function () {
	let usageTestFacade: UsageTestFacade
	let serviceExecutor: IServiceExecutor
	let entityClient: EntityClient
	let persistentStorage: UsageTestStorage
	let ephemeralStorage: UsageTestStorage
	let userFacadeMock: UserFacade
	const testDeviceId = "123testDeviceId321"

	const dateProvider = {
		now(): number {
			return Date.now()
		},
		timeZone(): string {
			throw new Error("Not implemented by this provider")
		},
	}

	const oldAssignment = createUsageTestAssignment({
		name: "oldAssignment",
		variant: "3",
		stages: [],
		sendPings: true,
		testId: "testId123",
	})
	const assignmentData: PersistedAssignmentData = {
		updatedAt: dateProvider.now() - ASSIGNMENT_UPDATE_INTERVAL_MS * 2,
		usageModelVersion: modelInfo.version,
		assignments: [oldAssignment],
	}

	const newAssignment = createUsageTestAssignment({
		name: "assignment1",
		variant: "1",
		stages: [],
		sendPings: true,
		testId: "testId123",
	})

	o.beforeEach(function () {
		serviceExecutor = object()
		entityClient = object()
		userFacadeMock = object()
		when(userFacadeMock.isPartiallyLoggedIn()).thenReturn(true)

		ephemeralStorage = new EphemeralUsageTestStorage()
		persistentStorage = new EphemeralUsageTestStorage()
		usageTestFacade = new UsageTestFacade(
			{
				[StorageBehavior.Persist]: persistentStorage,
				[StorageBehavior.Ephemeral]: ephemeralStorage,
			},
			dateProvider,
			serviceExecutor,
			entityClient,
			userFacadeMock,
		)

		replace(usageTestFacade, "customerProperties", createCustomerProperties({ usageDataOptedOut: false }))
		when(entityClient.load(UserSettingsGroupRootTypeRef, anything())).thenResolve(createUserSettingsGroupRoot({ usageDataOptedIn: true }))
	})

	async function assertStored(storage, result, assignment) {
		o(result[0].testId).equals(assignment.testId)
		const storedAssignment = await storage.getAssignments()
		o(storedAssignment?.assignments![0].testId).equals(assignment.testId)
		o(await storage.getTestDeviceId()).equals(testDeviceId)
	}

	o.spec("usage tests", function () {
		o.spec("usage test model loading assignments", function () {
			o("when there's no deviceId it does POST", async function () {
				when(
					serviceExecutor.post(UsageTestAssignmentService, createUsageTestAssignmentIn({}), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				const result = await usageTestFacade.loadActiveUsageTests()
				await assertStored(ephemeralStorage, result, newAssignment)
			})

			o("loads from server because model version has changed", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)
				await ephemeralStorage.storeAssignments({
					assignments: [],
					usageModelVersion: -1, // definitely outdated!
					updatedAt: dateProvider.now() - 1,
				})

				when(
					serviceExecutor.put(UsageTestAssignmentService, createUsageTestAssignmentIn({ testDeviceId }), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				const result = await usageTestFacade.loadActiveUsageTests()
				await assertStored(ephemeralStorage, result, newAssignment)
			})

			o("loads from server and stores if nothing is stored", async function () {
				when(
					serviceExecutor.put(UsageTestAssignmentService, createUsageTestAssignmentIn({ testDeviceId }), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				await ephemeralStorage.storeTestDeviceId(testDeviceId)

				const result = await usageTestFacade.loadActiveUsageTests()

				await assertStored(ephemeralStorage, result, newAssignment)
			})

			o("returns result from storage if it's there", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)
				assignmentData.updatedAt = dateProvider.now()
				await ephemeralStorage.storeAssignments(assignmentData)

				const result = await usageTestFacade.loadActiveUsageTests()

				await assertStored(ephemeralStorage, result, oldAssignment)
			})

			o("data outdated, loads from the server and stores", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)
				await ephemeralStorage.storeAssignments(assignmentData)

				when(
					serviceExecutor.put(UsageTestAssignmentService, createUsageTestAssignmentIn({ testDeviceId }), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)
				const result = await usageTestFacade.loadActiveUsageTests()
				await assertStored(ephemeralStorage, result, newAssignment)
			})

			o("data not outdated, returns result from storage", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)
				const nonOutdatedAssignmentData = clone(assignmentData)
				nonOutdatedAssignmentData.updatedAt = dateProvider.now() - ASSIGNMENT_UPDATE_INTERVAL_MS / 2
				await ephemeralStorage.storeAssignments(nonOutdatedAssignmentData)

				const result = await usageTestFacade.loadActiveUsageTests()
				await assertStored(ephemeralStorage, result, oldAssignment)
			})
		})

		o.spec("sendPing", function () {
			o("sends ping", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)

				const usageTest: UsageTest = new UsageTest("testId", "testName", 1, true)
				usageTest.pingAdapter = usageTestFacade
				const stage = new Stage(0, usageTest, 1, 1)
				usageTest.addStage(stage)
				const metric = {
					name: "foo",
					value: "bar",
				}
				stage.setMetric(metric)

				when(
					serviceExecutor.post(
						UsageTestParticipationService,
						createUsageTestParticipationIn({
							testId: usageTest.testId,
							metrics: [createUsageTestMetricData(metric)],
							stage: stage.number.toString(),
							testDeviceId: testDeviceId,
						}),
					),
				).thenResolve(undefined)

				await usageTestFacade.sendPing(usageTest, stage)

				verify(serviceExecutor.post(UsageTestParticipationService, anything()), { times: 1, ignoreExtraArgs: true })
			})

			o("sends pings in correct order", async function () {
				await ephemeralStorage.storeTestDeviceId(testDeviceId)

				const usageTest: UsageTest = new UsageTest("testId", "testName", 1, true)
				usageTest.pingAdapter = usageTestFacade

				for (let i = 0; i < 3; i++) {
					const stage = new Stage(i, usageTest, 1, 1)
					usageTest.addStage(stage)
				}

				const pingOrder: Array<string> = []

				when(
					serviceExecutor.post(
						UsageTestParticipationService,
						createUsageTestParticipationIn({
							testId: usageTest.testId,
							stage: "0",
							testDeviceId: testDeviceId,
						}),
						anything(),
					),
				).thenDo(async () => {
					// Simulate network delay
					await new Promise((resolve) => setTimeout(resolve, 15))
					pingOrder.push("0")
				})

				when(
					serviceExecutor.post(
						UsageTestParticipationService,
						createUsageTestParticipationIn({
							testId: usageTest.testId,
							stage: "1",
							testDeviceId: testDeviceId,
						}),
						anything(),
					),
				).thenDo(async () => {
					// Simulate network delay
					await new Promise((resolve) => setTimeout(resolve, 10))
					pingOrder.push("1")
				})

				when(
					serviceExecutor.post(
						UsageTestParticipationService,
						createUsageTestParticipationIn({
							testId: usageTest.testId,
							stage: "2",
							testDeviceId: testDeviceId,
						}),
						anything(),
					),
				).thenDo(async () => {
					pingOrder.push("2")
				})

				await usageTest.getStage(0).complete()
				await usageTest.getStage(1).complete()
				await usageTest.getStage(2).complete()

				o(pingOrder).deepEquals(["0", "1", "2"])
			})
		})

		o.spec("setting the storage behavior", function () {
			o("uses correct storage backend after the behavior has been set", async function () {
				usageTestFacade.setStorageBehavior(StorageBehavior.Persist)

				when(
					serviceExecutor.post(UsageTestAssignmentService, createUsageTestAssignmentIn({}), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				const result = await usageTestFacade.loadActiveUsageTests()

				await assertStored(persistentStorage, result, newAssignment)
				verify(ephemeralStorage.getTestDeviceId(), { times: 0 })
			})

			o("nothing is stored if customer has opted out", async function () {
				replace(usageTestFacade, "customerProperties", createCustomerProperties({ usageDataOptedOut: true }))

				usageTestFacade.setStorageBehavior(StorageBehavior.Persist)

				when(
					serviceExecutor.post(UsageTestAssignmentService, createUsageTestAssignmentIn({}), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				await usageTestFacade.loadActiveUsageTests()

				o(await persistentStorage.getAssignments()).equals(null)
				verify(ephemeralStorage.getTestDeviceId(), { times: 0 })
			})

			o("nothing is stored if user has not opted in", async function () {
				when(entityClient.load(UserSettingsGroupRootTypeRef, anything())).thenResolve(createUserSettingsGroupRoot({ usageDataOptedIn: false }))

				usageTestFacade.setStorageBehavior(StorageBehavior.Persist)

				when(
					serviceExecutor.post(UsageTestAssignmentService, createUsageTestAssignmentIn({}), {
						suspensionBehavior: SuspensionBehavior.Throw,
					}),
				).thenResolve(
					createUsageTestAssignmentOut({
						assignments: [newAssignment],
						testDeviceId: testDeviceId,
					}),
				)

				await usageTestFacade.loadActiveUsageTests()

				o(await persistentStorage.getAssignments()).equals(null)
				verify(ephemeralStorage.getTestDeviceId(), { times: 0 })
			})
		})
	})
})
