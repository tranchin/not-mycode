import { CRDTDelete, CRDTInsert, CRDTOperation } from "./CRDTOperation.js"
import { Vector } from "../Vector.js"
import { CRDTTransaction } from "./CRDTTransaction.js"

export class CRDTDocument {
	data: CRDTInsert[]
	version: Vector
	id: number

	constructor(numberOfParticipants: number, id: number) {
		this.data = []
		this.version = new Vector(Array(numberOfParticipants).fill(0))
		this.id = id
	}

	private insert(op: CRDTInsert) {
		if ((!op.hasRight() && !op.hasLeft()) || !op.hasRight()) {
			// is first to be added or shall be added at the end
			this.data.push(op)
			this.data[this.data.length - 1].setRight(op)
		} else if (!op.hasLeft()) {
			// shall be inserted at the beginning
			this.data.splice(0, 0, op)
			this.data[1].setLeft(op)
		} else {
			const left = op.getLeft()
			const leftIndex = this.data.indexOf(left) // find left character in array
			const rightIndex = leftIndex + 1

			this.data.splice(rightIndex, 0, op) // insert operation

			const leftId = op.getLeft().getId()
			const rightId = op.getRight().getId()

			// @ts-ignore
			// set new right of anchor
			this.data.find((o) => o.id == leftId).setRight(op)

			// @ts-ignore
			// set new left of anchor
			this.data.find((o) => o.id == rightId).setLeft(op)

			this.version.increment(this.id)
		}
	}

	private delete(op: CRDTDelete) {
		let opToDeleteId = op.getOperation().getId()
		let operationToDelete = this.data.find((o) => o.id == opToDeleteId)
		if (operationToDelete) {
			if (operationToDelete.deleted()) {
				console.log("Operation has already been deleted!")
			} else {
				// update anchors of operations anchors
				if (operationToDelete.hasLeft()) {
					const leftId = operationToDelete.getLeft().getId()
					const left = this.data.find((o) => o.id == leftId)
					if (left) {
						// set right anchor of left anchor of operation
						left.setRight(operationToDelete.getRight())
					}
				}
				if (operationToDelete.hasRight()) {
					const rightId = operationToDelete.getRight().getId()
					const right = this.data.find((o) => o.id == rightId)
					if (right) {
						// set left anchor of right anchor of operation
						right.setLeft(operationToDelete.getLeft())
					}
				}

				// now delete Operation from document, by marking it as "deleted", but not actually remove it yet
				// const opId = op.getOperation().getId()
				// const op2 = this.data.find(o => o.id == opId)
				this.data.splice(this.data.indexOf(op.getOperation()), 1)
				// if (op2) {
				// 	op2.delete()
				// }
			}
		}
	}

	public transact(transaction: CRDTTransaction) {
		transaction.getOperations().forEach((op) => {
			this.operate(op)
		})
	}

	public operate(op: CRDTOperation) {
		if (op instanceof CRDTInsert) {
			this.insert(op)
		} else {
			this.delete(op as CRDTDelete)
		}
	}

	public timestamp(): Vector {
		return this.version
	}

	public toString(): string {
		const rawData = this.data.filter((c) => !c.deleted()) // filters out all deleted characters
		const newData = rawData.map((d) => d.getData())
		return newData.join("")
	}
}
