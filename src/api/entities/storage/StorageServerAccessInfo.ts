import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"

import type {StorageServerUrl} from "./StorageServerUrl.js"

export const StorageServerAccessInfoTypeRef: TypeRef<StorageServerAccessInfo> = new TypeRef("storage", "StorageServerAccessInfo")
export const _TypeModel: TypeModel = {
	"name": "StorageServerAccessInfo",
	"since": 4,
	"type": "AGGREGATED_TYPE",
	"id": 150,
	"rootId": "B3N0b3JhZ2UAAJY",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_id": {
			"id": 151,
			"type": "CustomId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"blobAccessToken": {
			"id": 152,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"servers": {
			"id": 153,
			"type": "AGGREGATION",
			"cardinality": "Any",
			"final": false,
			"refType": "StorageServerUrl",
			"dependency": null
		}
	},
	"app": "storage",
	"version": "4"
}

export function createStorageServerAccessInfo(values?: Partial<StorageServerAccessInfo>): StorageServerAccessInfo {
	return Object.assign(create(_TypeModel, StorageServerAccessInfoTypeRef), downcast<StorageServerAccessInfo>(values))
}

export type StorageServerAccessInfo = {
	_type: TypeRef<StorageServerAccessInfo>;

	_id: Id;
	blobAccessToken: string;

	servers: StorageServerUrl[];
}