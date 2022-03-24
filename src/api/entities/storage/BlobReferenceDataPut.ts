import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"

import type {BlobReferenceTokenWrapper} from "../sys/BlobReferenceTokenWrapper.js"

export const BlobReferenceDataPutTypeRef: TypeRef<BlobReferenceDataPut> = new TypeRef("storage", "BlobReferenceDataPut")
export const _TypeModel: TypeModel = {
	"name": "BlobReferenceDataPut",
	"since": 1,
	"type": "DATA_TRANSFER_TYPE",
	"id": 94,
	"rootId": "B3N0b3JhZ2UAXg",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 95,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"archiveDataType": {
			"id": 123,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"instanceId": {
			"id": 107,
			"type": "GeneratedId",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"instanceListId": {
			"id": 97,
			"type": "GeneratedId",
			"cardinality": "ZeroOrOne",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"referenceTokens": {
			"id": 122,
			"type": "AGGREGATION",
			"cardinality": "Any",
			"final": true,
			"refType": "BlobReferenceTokenWrapper",
			"dependency": "sys"
		}
	},
	"app": "storage",
	"version": "4"
}

export function createBlobReferenceDataPut(values?: Partial<BlobReferenceDataPut>): BlobReferenceDataPut {
	return Object.assign(create(_TypeModel, BlobReferenceDataPutTypeRef), downcast<BlobReferenceDataPut>(values))
}

export type BlobReferenceDataPut = {
	_type: TypeRef<BlobReferenceDataPut>;

	_format: NumberString;
	archiveDataType: NumberString;
	instanceId: Id;
	instanceListId: null | Id;

	referenceTokens: BlobReferenceTokenWrapper[];
}