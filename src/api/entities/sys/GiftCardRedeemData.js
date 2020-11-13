// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardRedeemDataTypeRef: TypeRef<GiftCardRedeemData> = new TypeRef("sys", "GiftCardRedeemData")
export const _TypeModel: TypeModel = {
	"name": "GiftCardRedeemData",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1801,
	"rootId": "A3N5cwAHCQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1802,
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
			"id": 1803,
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

export function createGiftCardRedeemData(values?: $Shape<$Exact<GiftCardRedeemData>>): GiftCardRedeemData {
	return Object.assign(create(_TypeModel, GiftCardRedeemDataTypeRef), values)
}

export type GiftCardRedeemData = {
	_type: TypeRef<GiftCardRedeemData>;

	_format: NumberString;

	giftCard: IdTuple;
}