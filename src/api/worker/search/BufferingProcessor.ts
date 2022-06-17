import {isTest} from "../../common/Env"
import {ScheduledTimeoutId, Scheduler} from "../../common/utils/Scheduler.js"

export type Processor<T> = (entities: Array<T>) => Promise<unknown>

/**
 * Collects items to process with a given processor, and delays processing them until none have been received for {@link DEFAULT_PROCESS_DELAY_MS}
 *
 * If the processor callback throws, then the passed in items will be saved and the next time it runs, they will be
 * passed back in again with any new items. It is up to the caller to handle any that it may no longer need
 */
export class BufferingProcessor<T> {
	timeoutId: ScheduledTimeoutId | null = null;
	buffer: Array<T> = []
	isProcessing = false

	constructor(
		private scheduler: Scheduler,
		private processor: Processor<T>,
		private delay: number
	) {
		this.isProcessing = false
	}

	add(item: T) {
		this.buffer.push(item)
		this.schedule()
	}

	private schedule() {
		if (this.timeoutId != null) {
			this.scheduler.unscheduleTimeout(this.timeoutId)
		}

		this.timeoutId = this.scheduler.scheduleIn(this.process.bind(this), this.delay)
	}

	private async process() {
		if (this.isProcessing) {
			return this.schedule()
		}

		this.timeoutId = null
		this.isProcessing = true

		const batches = this.buffer
		this.buffer = []

		try {
			await this.processor(batches)
		} catch (e) {
			if (!isTest()) {
				console.error("Encountered error when processing buffer:", e)
			}
			// we will try them again in the next schedule
			this.buffer = batches.concat(this.buffer)
		} finally {
			this.isProcessing = false
		}
	}
}