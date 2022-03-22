import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"


export const StorageServerUrlTypeRef: TypeRef<StorageServerUrl> = new TypeRef("storage", "StorageServerUrl")
export const _TypeModel: TypeModel = {
	"name": "StorageServerUrl",
	"since": 4,
	"type": "AGGREGATED_TYPE",
	"id": 148,
	"rootId": "B3N0b3JhZ2UAAJQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_id": {
			"id": 149,
			"type": "CustomId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"url": {
			"id": 150,
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

export function createStorageServerUrl(values?: Partial<StorageServerUrl>): StorageServerUrl {
	return Object.assign(create(_TypeModel, StorageServerUrlTypeRef), downcast<StorageServerUrl>(values))
}

export type StorageServerUrl = {
	_type: TypeRef<StorageServerUrl>;

	_id: Id;
	url: string;
}