// @flow

import {defer, downcast, Thunk} from "@tutao/tutanota-utils"
import o from "ospec"
import {BufferingProcessor, Processor} from "../../../../../src/api/worker/search/BufferingProcessor.js"
import {ScheduledTimeoutId, Scheduler} from "../../../../../src/api/common/utils/Scheduler.js"
import {func, matchers, object, when} from "testdouble"
import {verify} from "@tutao/tutanota-test-utils"

o.spec("BufferingProcessor", function () {

	const timeout = 42

	let scheduler: Scheduler
	let processor: Processor<string | number>
	let buffer: BufferingProcessor<string | number>

	o.beforeEach(function () {
		scheduler = object<Scheduler>()
		processor = func() as Processor<string | number>
		buffer = new BufferingProcessor(scheduler, processor, timeout)
	})

	o("should not call the processor until after scheduler has completed", async function () {
		buffer.add("hewwo")
		verify(processor(["hewwo"]), {times: 0})
	})

	o("should only pass the added value to processor", async function () {

		const captor = matchers.captor()
		when(scheduler.scheduleIn(captor.capture(), timeout)).thenReturn(1)

		buffer.add("hewwo")

		await captor.value()

		verify(processor(["hewwo"]))
	})

	o("should process all the added values in a single call to the processor", async function () {

		const captor = matchers.captor()
		when(scheduler.scheduleIn(captor.capture(), timeout)).thenReturn(1)

		buffer.add("uwu")
		buffer.add("owo")
		buffer.add("^_^")

		await captor.value()
		verify(processor(["uwu", "owo", "^_^"]))
	})

	o("should call the processor multiple times", async function () {

		const captor = matchers.captor()

		buffer.add(1)
		buffer.add(2)
		buffer.add(3)

		verify(scheduler.scheduleIn(captor.capture(), timeout))
		await captor.value()

		buffer.add('a')
		buffer.add('b')
		buffer.add('c')

		verify(scheduler.scheduleIn(captor.capture(), timeout))
		await captor.value()

		buffer.add("foo")
		buffer.add("bar")
		buffer.add("baz")

		verify(scheduler.scheduleIn(captor.capture(), timeout))
		await captor.value()

		verify(processor([1, 2, 3]))
		verify(processor(['a', 'b', 'c']))
		verify(processor(['foo', 'bar', 'baz']))

	})

	o("should keep a batch when an error occurs, and then try to reprocess it again", async function () {
		const scheduler = new SchedulerMock()

		const processor = func() as Processor<number | string>
		when(processor(['a', 'b', 'c'])).thenReject(new Error("whoopsie daisy"))

		const buffer = new BufferingProcessor(scheduler, processor, NaN)

		buffer.add(1)
		buffer.add(2)
		buffer.add(3)

		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('a')
		buffer.add('b')
		buffer.add('c')

		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add("foo")
		buffer.add("bar")
		buffer.add("baz")

		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		verify(processor([1, 2, 3]))
		verify(processor(['a', 'b', 'c']))
		verify(processor(['a', 'b', 'c', "foo", "bar", "baz"]))
	})

	o("should not call processor again until after a previous call has resolved", async function () {

		const firstCallDeferred = defer<void>()
		const processorPromises = [firstCallDeferred.promise]

		const scheduler = new SchedulerMock()
		processor = o.spy(() => processorPromises.pop() ?? Promise.resolve())
		buffer = new BufferingProcessor(scheduler, processor, NaN)

		buffer.add(1)
		buffer.add(2)
		buffer.add(3)

		scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('a')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('b')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('c')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		await firstCallDeferred.resolve()
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		o(processor.calls.map(call => call.args)).deepEquals([[[1, 2, 3]], [['a', 'b', 'c']]])
	})

	o("schedule multiple times, has error, with overlap", async function () {


		const firstCallDeferred = defer()
		const processorPromises = [firstCallDeferred.promise]
		const scheduler = new SchedulerMock()
		processor = o.spy(() => processorPromises.pop() ?? Promise.resolve())
		buffer = new BufferingProcessor(scheduler, processor, NaN)

		buffer.add(1)
		buffer.add(2)
		buffer.add(3)

		scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('a')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('b')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		buffer.add('c')
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		await firstCallDeferred.reject(new Error("Ouch!!!"))
		await scheduler.schedule.get(downcast(scheduler.currentId))?.thunk()

		o(processor.calls.map(call => call.args)).deepEquals([[[1, 2, 3]], [[1, 2, 3, 'a', 'b', 'c']]])
	})
})


class SchedulerMock implements Scheduler {

	currentId: number
	schedule: Map<ScheduledTimeoutId, {time: number, thunk: Thunk}>

	constructor() {
		this.currentId = downcast(-1)
		this.schedule = new Map()
	}

	scheduleAt() {
		throw new Error("Don't call this ok?")
	}

	scheduleIn(thunk, time) {
		const id = downcast(++this.currentId)
		this.schedule.set(id, {time, thunk})
		return id
	}

	schedulePeriodic() {
		throw new Error("Don't call me!")
	}

	unschedulePeriodic() {
		throw new Error("Don't call me!")
	}

	unscheduleTimeout(id: ScheduledTimeoutId): void {
		id = downcast(id)
		const scheduled = this.schedule.get(id)
		if (scheduled) {
			this.schedule.delete(id)
		}
	}
}