// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardUpdateDataTypeRef: TypeRef<GiftCardUpdateData> = new TypeRef("sys", "GiftCardUpdateData")
export const _TypeModel: TypeModel = {
	"name": "GiftCardUpdateData",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1795,
	"rootId": "A3N5cwAHAw",
	"versioned": false,
	"encrypted": true,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1796,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"message": {
			"name": "message",
			"id": 1798,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": true,
			"encrypted": true
		}
	},
	"associations": {
		"giftCard": {
			"name": "giftCard",
			"id": 1797,
			"since": 64,
			"type": "LIST_ELEMENT_ASSOCIATION",
			"cardinality": "One",
			"refType": "GiftCard",
			"final": true,
			"external": false
		}
	},
	"app": "sys",
	"version": "64"
}

export function createGiftCardUpdateData(values?: $Shape<$Exact<GiftCardUpdateData>>): GiftCardUpdateData {
	return Object.assign(create(_TypeModel, GiftCardUpdateDataTypeRef), values)
}

export type GiftCardUpdateData = {
	_type: TypeRef<GiftCardUpdateData>;
	_errors: Object;

	_format: NumberString;
	message: string;

	giftCard: IdTuple;
}