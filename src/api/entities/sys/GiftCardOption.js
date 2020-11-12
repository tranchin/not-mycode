// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardOptionTypeRef: TypeRef<GiftCardOption> = new TypeRef("sys", "GiftCardOption")
export const _TypeModel: TypeModel = {
	"name": "GiftCardOption",
	"since": 64,
	"type": "AGGREGATED_TYPE",
	"id": 1783,
	"rootId": "A3N5cwAG9w",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_id": {
			"name": "_id",
			"id": 1784,
			"since": 64,
			"type": "CustomId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"value": {
			"name": "value",
			"id": 1785,
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

export function createGiftCardOption(values?: $Shape<$Exact<GiftCardOption>>): GiftCardOption {
	return Object.assign(create(_TypeModel, GiftCardOptionTypeRef), values)
}

export type GiftCardOption = {
	_type: TypeRef<GiftCardOption>;

	_id: Id;
	value: NumberString;
}