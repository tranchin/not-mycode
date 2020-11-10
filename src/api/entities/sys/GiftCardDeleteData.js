// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardDeleteDataTypeRef: TypeRef<GiftCardDeleteData> = new TypeRef("sys", "GiftCardDeleteData")
export const _TypeModel: TypeModel = {
	"name": "GiftCardDeleteData",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1793,
	"rootId": "A3N5cwAHAQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1794,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"giftCard": {
			"name": "giftCard",
			"id": 1795,
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

export function createGiftCardDeleteData(values?: $Shape<$Exact<GiftCardDeleteData>>): GiftCardDeleteData {
	return Object.assign(create(_TypeModel, GiftCardDeleteDataTypeRef), values)
}

export type GiftCardDeleteData = {
	_type: TypeRef<GiftCardDeleteData>;

	_format: NumberString;

	giftCard: IdTuple;
}