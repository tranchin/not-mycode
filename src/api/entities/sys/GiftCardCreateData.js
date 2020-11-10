// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardCreateDataTypeRef: TypeRef<GiftCardCreateData> = new TypeRef("sys", "GiftCardCreateData")
export const _TypeModel: TypeModel = {
	"name": "GiftCardCreateData",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1783,
	"rootId": "A3N5cwAG9w",
	"versioned": false,
	"encrypted": true,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1784,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"country": {
			"name": "country",
			"id": 1788,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"message": {
			"name": "message",
			"id": 1785,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": true
		},
		"ownerEncSessionKey": {
			"name": "ownerEncSessionKey",
			"id": 1787,
			"since": 64,
			"type": "Bytes",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"packageOption": {
			"name": "packageOption",
			"id": 1786,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {},
	"app": "sys",
	"version": "64"
}

export function createGiftCardCreateData(values?: $Shape<$Exact<GiftCardCreateData>>): GiftCardCreateData {
	return Object.assign(create(_TypeModel, GiftCardCreateDataTypeRef), values)
}

export type GiftCardCreateData = {
	_type: TypeRef<GiftCardCreateData>;
	_errors: Object;

	_format: NumberString;
	country: string;
	message: string;
	ownerEncSessionKey: Uint8Array;
	packageOption: NumberString;
}