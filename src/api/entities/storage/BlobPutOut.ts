import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"


export const BlobPutOutTypeRef: TypeRef<BlobPutOut> = new TypeRef("storage", "BlobPutOut")
export const _TypeModel: TypeModel = {
	"name": "BlobPutOut",
	"since": 4,
	"type": "DATA_TRANSFER_TYPE",
	"id": 124,
	"rootId": "B3N0b3JhZ2UAfA",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 125,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"blobReferenceToken": {
			"id": 126,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {},
	"app": "storage",
	"version": "4"
}

export function createBlobPutOut(values?: Partial<BlobPutOut>): BlobPutOut {
	return Object.assign(create(_TypeModel, BlobPutOutTypeRef), downcast<BlobPutOut>(values))
}

export type BlobPutOut = {
	_type: TypeRef<BlobPutOut>;

	_format: NumberString;
	blobReferenceToken: string;
}