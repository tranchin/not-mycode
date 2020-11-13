// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardCreateReturnTypeRef: TypeRef<GiftCardCreateReturn> = new TypeRef("sys", "GiftCardCreateReturn")
export const _TypeModel: TypeModel = {
	"name": "GiftCardCreateReturn",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1797,
	"rootId": "A3N5cwAHBQ",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1798,
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
			"id": 1799,
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

export function createGiftCardCreateReturn(values?: $Shape<$Exact<GiftCardCreateReturn>>): GiftCardCreateReturn {
	return Object.assign(create(_TypeModel, GiftCardCreateReturnTypeRef), values)
}

export type GiftCardCreateReturn = {
	_type: TypeRef<GiftCardCreateReturn>;

	_format: NumberString;

	giftCard: IdTuple;
}