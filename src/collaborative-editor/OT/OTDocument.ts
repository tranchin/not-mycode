import { OTTransaction } from "./OTTransaction.js"
import { OTDelete, OTInsert, OTOperation } from "./OTOperation.js"
import { Vector } from "../Vector.js"

export class OTDocument {
	data: string[]
	version: Vector
	id: number

	constructor(numberOfParticipants: number, id: number) {
		this.data = []
		this.version = new Vector(Array(numberOfParticipants).fill(0))
		this.id = id
	}

	private insert(op: OTInsert) {
		this.data.splice(op.getIndex(), 0, op.getData())
		this.version.increment(this.id)
	}

	private delete(op: OTDelete) {
		this.data.splice(op.getIndex(), 1)
		this.version.increment(this.id)
	}

	public transact(transaction: OTTransaction) {
		transaction.getOperations().forEach((op) => {
			this.operate(op)
		})
	}

	public transactMultiple(transactions: OTTransaction[]) {}

	public operate(op: OTOperation) {
		if (op instanceof OTInsert) {
			this.insert(op)
		} else {
			this.delete(op as OTDelete)
		}
	}

	public timestamp(): Vector {
		return this.version
	}

	public print() {
		console.log(this.data.join())
	}

	public toString(): string {
		return this.data.join("")
	}
}
