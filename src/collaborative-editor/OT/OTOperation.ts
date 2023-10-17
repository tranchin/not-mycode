import { Vector } from "../Vector.js"

export interface OTOperation {
	index: number
	timestamp: Vector
}

export class OTInsert implements OTOperation {
	index: number
	data: string
	timestamp: Vector

	constructor(index: number, data: string, timestamp: Vector) {
		this.index = index
		this.data = data
		this.timestamp = timestamp
	}

	public getIndex(): number {
		return this.index
	}

	public getData(): string {
		return this.data
	}
}

export class OTDelete implements OTOperation {
	index: number
	timestamp: Vector

	constructor(index: number, timestamp: Vector) {
		this.index = index
		this.timestamp = timestamp
	}

	public getIndex(): number {
		return this.index
	}
}
