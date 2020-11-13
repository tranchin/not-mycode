// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardsRefTypeRef: TypeRef<GiftCardsRef> = new TypeRef("sys", "GiftCardsRef")
export const _TypeModel: TypeModel = {
	"name": "GiftCardsRef",
	"since": 64,
	"type": "AGGREGATED_TYPE",
	"id": 1778,
	"rootId": "A3N5cwAG8g",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_id": {
			"name": "_id",
			"id": 1779,
			"since": 64,
			"type": "CustomId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		}
	},
	"associations": {
		"items": {
			"name": "items",
			"id": 1780,
			"since": 64,
			"type": "LIST_ASSOCIATION",
			"cardinality": "One",
			"refType": "GiftCard",
			"final": true,
			"external": false
		}
	},
	"app": "sys",
	"version": "64"
}

export function createGiftCardsRef(values?: $Shape<$Exact<GiftCardsRef>>): GiftCardsRef {
	return Object.assign(create(_TypeModel, GiftCardsRefTypeRef), values)
}

export type GiftCardsRef = {
	_type: TypeRef<GiftCardsRef>;

	_id: Id;

	items: Id;
}