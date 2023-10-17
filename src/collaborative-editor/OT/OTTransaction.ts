import { OTOperation } from "./OTOperation.js"

export class OTTransaction {
	operations: OTOperation[]

	constructor() {
		this.operations = []
	}

	public addOperation(op: OTOperation) {
		this.operations.push(op)
	}

	public getOperations(): OTOperation[] {
		return this.operations
	}
}
