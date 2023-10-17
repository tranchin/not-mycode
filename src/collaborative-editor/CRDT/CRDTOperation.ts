import { Vector } from "../Vector.js"
import { neverNull } from "@tutao/tutanota-utils"

export interface CRDTOperation {
	id: number
	timestamp: Vector

	getId(): number
	getTimestamp(): Vector
}

export class CRDTInsert implements CRDTOperation {
	id: number
	data: string
	left: CRDTInsert | null
	right: CRDTInsert | null
	timestamp: Vector
	isDeleted: boolean

	constructor(id: number, data: string, left: CRDTInsert | null, right: CRDTInsert | null, timestamp: Vector) {
		this.id = id
		this.data = data
		this.left = left
		this.right = right
		this.timestamp = timestamp
		this.isDeleted = false
	}

	public getId(): number {
		return this.id
	}

	public getData(): string {
		return this.data
	}

	public delete() {
		this.isDeleted = true
	}

	public deleted(): boolean {
		return this.isDeleted
	}

	getLeft(): CRDTInsert {
		return neverNull(this.left)
	}

	getRight(): CRDTInsert {
		return neverNull(this.right)
	}

	hasLeft(): boolean {
		return this.left != null
	}

	hasRight(): boolean {
		return this.right != null
	}

	setLeft(left: CRDTInsert) {
		this.left = left
	}

	setRight(right: CRDTInsert) {
		this.right = right
	}

	getTimestamp(): Vector {
		return this.timestamp
	}
}

export class CRDTDelete implements CRDTOperation {
	id: number
	op: CRDTInsert
	timestamp: Vector

	constructor(id: number, op: CRDTInsert, timestamp: Vector) {
		this.id = id
		this.op = op
		this.timestamp = timestamp
	}

	public getId(): number {
		return this.id
	}

	public getOperation(): CRDTInsert {
		return this.op
	}

	getTimestamp(): Vector {
		return this.timestamp
	}
}
