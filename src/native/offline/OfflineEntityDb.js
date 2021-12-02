// @flow

import type {NativeInterface} from "../common/NativeInterface"
import {Request} from "../../api/common/RemoteMessageDispatcher"
import type {ListElementEntity, SomeEntity} from "../../api/common/EntityTypes"
import {TypeRef} from "@tutao/tutanota-utils"

/**
 * TODO:
 *  Migrations
 *  Write/Read/Delete multiple
 *  Don't just send raw entities per query: We should probably send them as json alongside id + listId + typeref.
 *                                          then we can deal with any kind of migrations on the web side
 */

type Query<T> = {
	typeRef: TypeRef<T>,
	elementId: string,
	listId: ?string
}

export class OfflineEntityDb {
	+_native: NativeInterface

	constructor(native: NativeInterface) {
		this._native = native
	}

	async write<T: SomeEntity>(entity: T): Promise<void> {
		return this.writeMultiple([entity])
	}

	async writeMultiple<T: SomeEntity>(entities: Array<T>): Promise<void> {
		const query = entities.map(entity => ({
			listId: typeof entity._id === "string" ? null : entity._id[0],
			elementId: typeof entity._id === "string" ? entity._id : entity._id[1],
			typeRef: entity._type.getStringRepresentation(),
			entityJson: JSON.stringify(entity)
		}))
		await this._native.invokeNative(new Request("offline.write", [query]))

	}

	async load<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, elementId: Id): Promise<?T> {

		const dings = await this.loadMultiple([{typeRef, listId, elementId}])
		const loaded = await this.loadMultiple([{typeRef, listId, elementId}])
		return loaded[0]
	}

	async loadMultiple<T: SomeEntity>(queries: Array<Query<T>>): Promise<Array<T>> {
		const query = queries.map(({listId, elementId, typeRef}) => ({
			listId: listId ?? null,
			elementId: elementId,
			typeRef: typeRef.getStringRepresentation()
		}))
		const entityJson = await this._native.invokeNative(new Request("offline.load", [query]))
		return JSON.parse(entityJson)
	}

	async loadRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, startId: Id, count: ?number): Promise<{found: Array<T>, notFound: Array<Id>}> {

	}

	async delete<T: SomeEntity>(typeRef: TypeRef<T>, elementId: Id, listId: ?Id): Promise<void> {
		const entityJson = await this._native.invokeNative(new Request("offline.delete", [{typeRef, elementId, listId}]))
		return JSON.parse(entityJson)
	}
}