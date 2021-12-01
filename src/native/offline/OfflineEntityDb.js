// @flow

import type {NativeInterface} from "../common/NativeInterface"
import {Request} from "../../api/common/RemoteMessageDispatcher"
import type {SomeEntity} from "../../api/common/EntityTypes"
import {TypeRef} from "@tutao/tutanota-utils"

/**
 * TODO:
 *  Migrations
 *  Write/Read/Delete multiple
 *  Don't just send raw entities per query: We should probably send them as json alongside id + listId + typeref.
 *                                          then we can deal with any kind of migrations on the web side
 */

type QueryBase<T> = {
	typeRef: string,
	elementId: string,
	listId?: string
}

type LoadQuery<T> = QueryBase<T> & {
	query: "load"
}

export class OfflineEntityDb {
	+_native: NativeInterface

	constructor(native: NativeInterface) {
		this._native = native
	}

	async create<T: SomeEntity>(entity: T): Promise<void> {
		return this.createMultiple([entity])
	}

	async createMultiple<T: SomeEntity>(entities: Array<T>): Promise<void> {
		const query = entities.map(entity => ({
			listId: typeof entity._id === "string" ? null : entity._id[0],
			elementId: typeof entity._id === "string" ? entity._id : entity._id[1],
			typeRef: entity._type.getStringRepresentation(),
			entityJson: JSON.stringify(entity)
		}))
		await this._native.invokeNative(new Request("createEntity", [query]))

	}

	async load<T: SomeEntity>(query: Query<T>): Promise<T> {
		const result = await this.loadMultiple([query])
		return result[0]
	}

	async loadMultiple<T: SomeEntity>(queries: Array<Query<T>>): Promise<T> {
		const query = queries.map(query => {

		})
		const entityJson = await this._native.invokeNative(new Request("loadEntity", [{typeRef, elementId, listId}]))
		return JSON.parse(entityJson)
	}

	async delete<T: SomeEntity>(typeRef: TypeRef<T>, elementId: Id, listId: ?Id): Promise<void> {
		const entityJson = await this._native.invokeNative(new Request("deleteEntity", [{typeRef, elementId, listId}]))
		return JSON.parse(entityJson)
	}
}