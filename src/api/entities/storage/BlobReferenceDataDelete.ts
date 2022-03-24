import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"

import type {Blob} from "../sys/Blob.js"

export const BlobReferenceDataDeleteTypeRef: TypeRef<BlobReferenceDataDelete> = new TypeRef("storage", "BlobReferenceDataDelete")
export const _TypeModel: TypeModel = {
	"name": "BlobReferenceDataDelete",
	"since": 1,
	"type": "DATA_TRANSFER_TYPE",
	"id": 100,
	"rootId": "B3N0b3JhZ2UAZA",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 101,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"archiveDataType": {
			"id": 124,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"instanceId": {
			"id": 103,
			"type": "GeneratedId",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"instanceListId": {
			"id": 102,
			"type": "GeneratedId",
			"cardinality": "ZeroOrOne",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"blobs": {
			"id": 105,
			"type": "AGGREGATION",
			"cardinality": "Any",
			"final": true,
			"refType": "Blob",
			"dependency": "sys"
		}
	},
	"app": "storage",
	"version": "4"
}

export function createBlobReferenceDataDelete(values?: Partial<BlobReferenceDataDelete>): BlobReferenceDataDelete {
	return Object.assign(create(_TypeModel, BlobReferenceDataDeleteTypeRef), downcast<BlobReferenceDataDelete>(values))
}

export type BlobReferenceDataDelete = {
	_type: TypeRef<BlobReferenceDataDelete>;

	_format: NumberString;
	archiveDataType: NumberString;
	instanceId: Id;
	instanceListId: null | Id;

	blobs: Blob[];
}