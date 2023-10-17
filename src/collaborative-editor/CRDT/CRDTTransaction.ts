import { CRDTOperation } from "./CRDTOperation.js"

export class CRDTTransaction {
	operations: CRDTOperation[]

	constructor() {
		this.operations = []
	}

	public addOperation(op: CRDTOperation) {
		this.operations.push(op)
	}

	public getOperations(): CRDTOperation[] {
		return this.operations
	}
}
