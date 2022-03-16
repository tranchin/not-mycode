import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"

import type {BlobReadData} from "./BlobReadData.js"
import type {BlobWriteData} from "./BlobWriteData.js"

export const BlobAccessTokenDataTypeRef: TypeRef<BlobAccessTokenData> = new TypeRef("storage", "BlobAccessTokenData")
export const _TypeModel: TypeModel = {
	"name": "BlobAccessTokenData",
	"since": 1,
	"type": "DATA_TRANSFER_TYPE",
	"id": 77,
	"rootId": "B3N0b3JhZ2UATQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 78,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"archiveDataType": {
			"id": 174,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"read": {
			"id": 175,
			"type": "AGGREGATION",
			"cardinality": "ZeroOrOne",
			"final": true,
			"refType": "BlobReadData",
			"dependency": null
		},
		"write": {
			"id": 80,
			"type": "AGGREGATION",
			"cardinality": "ZeroOrOne",
			"final": false,
			"refType": "BlobWriteData",
			"dependency": null
		}
	},
	"app": "storage",
	"version": "4"
}

export function createBlobAccessTokenData(values?: Partial<BlobAccessTokenData>): BlobAccessTokenData {
	return Object.assign(create(_TypeModel, BlobAccessTokenDataTypeRef), downcast<BlobAccessTokenData>(values))
}

export type BlobAccessTokenData = {
	_type: TypeRef<BlobAccessTokenData>;

	_format: NumberString;
	archiveDataType: NumberString;

	read:  null | BlobReadData;
	write:  null | BlobWriteData;
}