// @flow

import {create, TypeRef} from "../../common/EntityFunctions"

import type {GiftCardOption} from "./GiftCardOption"

export const GiftCardGetReturnTypeRef: TypeRef<GiftCardGetReturn> = new TypeRef("sys", "GiftCardGetReturn")
export const _TypeModel: TypeModel = {
	"name": "GiftCardGetReturn",
	"since": 65,
	"type": "DATA_TRANSFER_TYPE",
	"id": 1788,
	"rootId": "A3N5cwAG_A",
	"versioned": false,
	"encrypted": true,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1789,
			"since": 65,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"maxPerPeriod": {
			"name": "maxPerPeriod",
			"id": 1790,
			"since": 65,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"period": {
			"name": "period",
			"id": 1791,
			"since": 65,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"options": {
			"name": "options",
			"id": 1792,
			"since": 65,
			"type": "AGGREGATION",
			"cardinality": "Any",
			"refType": "GiftCardOption",
			"final": false
		}
	},
	"app": "sys",
	"version": "65"
}

export function createGiftCardGetReturn(values?: $Shape<$Exact<GiftCardGetReturn>>): GiftCardGetReturn {
	return Object.assign(create(_TypeModel, GiftCardGetReturnTypeRef), values)
}

export type GiftCardGetReturn = {
	_type: TypeRef<GiftCardGetReturn>;
	_errors: Object;

	_format: NumberString;
	maxPerPeriod: NumberString;
	period: NumberString;

	options: GiftCardOption[];
}