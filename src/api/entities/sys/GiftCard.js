// @flow

import {create, TypeRef} from "../../common/EntityFunctions"


export const GiftCardTypeRef: TypeRef<GiftCard> = new TypeRef("sys", "GiftCard")
export const _TypeModel: TypeModel = {
	"name": "GiftCard",
	"since": 64,
	"type": "LIST_ELEMENT_TYPE",
	"id": 1766,
	"rootId": "A3N5cwAG5g",
	"versioned": false,
	"encrypted": true,
	"values": {
		"_format": {
			"name": "_format",
			"id": 1770,
			"since": 64,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"_id": {
			"name": "_id",
			"id": 1768,
			"since": 64,
			"type": "GeneratedId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"_ownerEncSessionKey": {
			"name": "_ownerEncSessionKey",
			"id": 1772,
			"since": 64,
			"type": "Bytes",
			"cardinality": "ZeroOrOne",
			"final": true,
			"encrypted": false
		},
		"_ownerGroup": {
			"name": "_ownerGroup",
			"id": 1771,
			"since": 64,
			"type": "GeneratedId",
			"cardinality": "ZeroOrOne",
			"final": true,
			"encrypted": false
		},
		"_permissions": {
			"name": "_permissions",
			"id": 1769,
			"since": 64,
			"type": "GeneratedId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"country": {
			"name": "country",
			"id": 1777,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"message": {
			"name": "message",
			"id": 1774,
			"since": 64,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": true
		},
		"orderDate": {
			"name": "orderDate",
			"id": 1775,
			"since": 64,
			"type": "Date",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		},
		"redeemedDate": {
			"name": "redeemedDate",
			"id": 1776,
			"since": 64,
			"type": "Date",
			"cardinality": "ZeroOrOne",
			"final": true,
			"encrypted": false
		},
		"value": {
			"name": "value",
			"id": 1773,
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

export function createGiftCard(values?: $Shape<$Exact<GiftCard>>): GiftCard {
	return Object.assign(create(_TypeModel, GiftCardTypeRef), values)
}

export type GiftCard = {
	_type: TypeRef<GiftCard>;
	_errors: Object;

	_format: NumberString;
	_id: IdTuple;
	_ownerEncSessionKey: ?Uint8Array;
	_ownerGroup: ?Id;
	_permissions: Id;
	country: string;
	message: string;
	orderDate: Date;
	redeemedDate: ?Date;
	value: NumberString;
}