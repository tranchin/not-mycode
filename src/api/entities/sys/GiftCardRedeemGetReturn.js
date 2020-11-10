// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardRedeemGetReturnTypeRef: TypeRef<GiftCardRedeemGetReturn> = new TypeRef("sys", "GiftCardRedeemGetReturn")
export const _TypeModel: TypeModel = {
	"name": "GiftCardRedeemGetReturn",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1803,
	"rootId": "A3N5cwAHCw",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1804,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"country": {
			"name": "country",
			"id": 1807,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"encryptedMessage": {
			"name": "encryptedMessage",
			"id": 1805,
			"since": 64,
			"type": "Bytes",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"packageOption": {
			"name": "packageOption",
			"id": 1806,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		}
	},
	"associations": {},
	"app": "sys",
	"version": "64"
}

export function createGiftCardRedeemGetReturn(values?: $Shape<$Exact<GiftCardRedeemGetReturn>>): GiftCardRedeemGetReturn {
	return Object.assign(create(_TypeModel, GiftCardRedeemGetReturnTypeRef), values)
}

export type GiftCardRedeemGetReturn = {
	_type: TypeRef<GiftCardRedeemGetReturn>;

	_format: NumberString;
	country: string;
	encryptedMessage: Uint8Array;
	packageOption: NumberString;
}