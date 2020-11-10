// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardRedeemGetDataTypeRef: TypeRef<GiftCardRedeemGetData> = new TypeRef("sys", "GiftCardRedeemGetData")
export const _TypeModel: TypeModel = {
	"name": "GiftCardRedeemGetData",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1800,
	"rootId": "A3N5cwAHCA",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1801,
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
			"id": 1802,
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

export function createGiftCardRedeemGetData(values?: $Shape<$Exact<GiftCardRedeemGetData>>): GiftCardRedeemGetData {
	return Object.assign(create(_TypeModel, GiftCardRedeemGetDataTypeRef), values)
}

export type GiftCardRedeemGetData = {
	_type: TypeRef<GiftCardRedeemGetData>;

	_format: NumberString;

	giftCard: IdTuple;
}