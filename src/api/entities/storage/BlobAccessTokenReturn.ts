import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"

import type {StorageServerAccessInfo} from "./StorageServerAccessInfo.js"

export const BlobAccessTokenReturnTypeRef: TypeRef<BlobAccessTokenReturn> = new TypeRef("storage", "BlobAccessTokenReturn")
export const _TypeModel: TypeModel = {
	"name": "BlobAccessTokenReturn",
	"since": 1,
	"type": "DATA_TRANSFER_TYPE",
	"id": 81,
	"rootId": "B3N0b3JhZ2UAUQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 82,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"storageAccessInfo": {
			"id": 154,
			"type": "AGGREGATION",
			"cardinality": "One",
			"final": false,
			"refType": "StorageServerAccessInfo",
			"dependency": null
		}
	},
	"app": "storage",
	"version": "4"
}

export function createBlobAccessTokenReturn(values?: Partial<BlobAccessTokenReturn>): BlobAccessTokenReturn {
	return Object.assign(create(_TypeModel, BlobAccessTokenReturnTypeRef), downcast<BlobAccessTokenReturn>(values))
}

export type BlobAccessTokenReturn = {
	_type: TypeRef<BlobAccessTokenReturn>;

	_format: NumberString;

	storageAccessInfo: StorageServerAccessInfo;
}