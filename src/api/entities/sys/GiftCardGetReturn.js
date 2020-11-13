// @flow

import {create, TypeRef} from "../../common/EntityFunctions"

import type {GiftCardOption} from "./GiftCardOption"

export const GiftCardGetReturnTypeRef: TypeRef<GiftCardGetReturn> = new TypeRef("sys", "GiftCardGetReturn")
export const _TypeModel: TypeModel = {
	"name": "GiftCardGetReturn",
	"since": 64,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1785,
	"rootId": "A3N5cwAG-Q",
	"versioned": false,
	"encrypted": true,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1786,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"options": {
			"name": "options",
			"id": 1787,
			"since": 64,
			"type": "AGGREGATION",
			"cardinality": "Any",
			"refType": "GiftCardOption",
			"final": false
		}
	},
	"app": "sys",
	"version": "64"
}

export function createGiftCardGetReturn(values?: $Shape<$Exact<GiftCardGetReturn>>): GiftCardGetReturn {
	return Object.assign(create(_TypeModel, GiftCardGetReturnTypeRef), values)
}

export type GiftCardGetReturn = {
	_type: TypeRef<GiftCardGetReturn>;
	_errors: Object;

	_format: NumberString;

	options: GiftCardOption[];
}