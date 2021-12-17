// @flow
import type {EntityRestInterface} from "./EntityRestClient"
import {resolveTypeReference} from "../../common/EntityFunctions"
import {OperationType} from "../../common/TutanotaConstants"
import {clone, downcast, flat, getFromMap, groupBy, isSameTypeRef, remove, TypeRef, typeRefToPath} from "@tutao/tutanota-utils"
import {containsEventOfType, getEventOfType} from "../../common/utils/Utils"
import {PermissionTypeRef} from "../../entities/sys/Permission"
import {EntityEventBatchTypeRef} from "../../entities/sys/EntityEventBatch"
import {ValueType} from "../../common/EntityConstants"
import {SessionTypeRef} from "../../entities/sys/Session"
import {BucketPermissionTypeRef} from "../../entities/sys/BucketPermission"
import {SecondFactorTypeRef} from "../../entities/sys/SecondFactor"
import {RecoverCodeTypeRef} from "../../entities/sys/RecoverCode"
import {NotAuthorizedError, NotFoundError} from "../../common/error/RestError"
import {MailTypeRef} from "../../entities/tutanota/Mail"
import type {EntityUpdate} from "../../entities/sys/EntityUpdate"
import {RejectedSenderTypeRef} from "../../entities/sys/RejectedSender"
import {firstBiggerThanSecond, GENERATED_MAX_ID, GENERATED_MIN_ID, getElementId, getLetId} from "../../common/utils/EntityUtils";
import {ProgrammingError} from "../../common/error/ProgrammingError"
import {assertWorkerOrNode} from "../../common/Env"
import type {$Promisable} from "@tutao/tutanota-utils/"
import type {ElementEntity, ListElementEntity, SomeEntity} from "../../common/EntityTypes"
import {BookingTypeRef} from "../../entities/sys/Booking"


assertWorkerOrNode()

type ListCache = {
	allRange: Id[],
	lowerRangeId: Id,
	upperRangeId: Id,
	elements: Map<Id, ListElementEntity>
}

// export interface CacheStorage {
// 	/**
// 	 * Get a given entity from the cache, expects that you have already checked for existence
// 	 */
// 	get<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, id: Id): T;
//
// 	contains(typeRef: TypeRef<any>, listId: ?Id, id: Id): boolean;
//
// 	deleteIfExists<T>(typeRef: TypeRef<T>, listId: ?Id, id: Id): void;
//
// 	getListEntry<T>(typeRef: TypeRef<T>, listId: Id): ?ListEntry;
//
// 	addListEntry<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, entry: ListEntry): void;
//
// 	addElementEntity<T: ElementEntity>(typeRef: TypeRef<T>, id: Id, entity: T): void;
//
// 	isElementIdInCacheRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, id: Id): boolean;
// }
//
// class OfflineStorageInterface {
//
// 	native: NativeInterface
//
// 	load<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, ids: Array<Id>): T {
//
// 	}
//
// 	write<T: SomeEntity>(entities: Array<T>): void {
//
// 	}
//
// 	delete<T>(typeRef: TypeRef<T>, listId: ?Id, ids: Array<Id>): void {
//
// 	}
// }

/*
	TABLE entity:
	| type*     | listId*      | elementId*   | entity*
	---------------------------------------------------
	| app/type1 | -----------1 | -----------1 | (blob)
	| app/type1 | -----------1 | -----------2 | (blob)
	| app/type1 | -----------1 | -----------3 | (blob)
	| app/type1 | -----------2 | -----------4 | (blob)
	| app/type1 | -----------2 | -----------5 | (blob)
	| app/type1 | -----------2 | -----------6 | (blob)
	| app/type2 | ""           | -----------7 | (blob)
	| app/type2 | ""           | -----------8 | (blob)
	| app/type2 | ""           | -----------9 | (blob)

	TABLE listEntry
	|
	-
	|
	|

 */

// class PersistentCacheStorage implements CacheStorage {
//
// 	native: NativeInterface
//
// 	constructor(native: NativeInterface) {
// 		this.native = native
// 	}
//
// 	addElementEntity<T: ElementEntity>(typeRef: TypeRef<T>, id: Id, entity: T): void {
//
// 	}
//
// 	addListEntry<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, entry: ListEntry): void {
// 	}
//
// 	contains<T>(typeRef: TypeRef<*>, listId: ?Id, id: Id): boolean {
// 		return false;
// 	}
//
// 	deleteIfExists<T>(typeRef: TypeRef<T>, listId: ?Id, id: Id): void {
// 	}
//
// 	get<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, id: Id): T {
// 		return undefined;
// 	}
//
// 	getListEntry<T>(typeRef: TypeRef<T>, listId: Id): ?ListEntry {
// 		return undefined;
// 	}
// }

export class CacheStorage {
	_entities: Map<string, Map<Id, ElementEntity>> = new Map()
	_lists: Map<string, Map<Id, ListCache>> = new Map()

	/**
	 * Get a given entity from the cache, expects that you have already checked for existence
	 */
	get<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, id: Id): T {
		// Flow doesn't know that listId will only be non-null when it's a ListElementType
		// And respectively, only null if it's an ElementType
		// hence the downcast
		// We could probably do this in a typesafe way
		const path = typeRefToPath(typeRef)
		if (listId) {
			return clone(downcast(this._lists.get(path)?.get(listId)?.elements.get(id)))
		} else {
			return clone(downcast(this._entities.get(path))?.get(id))
		}
	}

	contains(typeRef: TypeRef<any>, listId: ?Id, id: Id): boolean {
		return this.get(typeRef, listId, id) != null
	}

	deleteIfExists<T>(typeRef: TypeRef<T>, listId: ?Id, id: Id) {
		const path = typeRefToPath(typeRef)
		if (listId) {
			const cache = this._lists.get(path)?.get(listId)
			if (cache != null) {
				cache.elements.delete(id)
				remove(cache.allRange, id)
			}
		} else {
			this._entities.get(path)?.delete(id)
		}
	}

	getListCache<T>(typeRef: TypeRef<T>, listId: Id): ?ListCache {
		return this._lists.get(typeRefToPath(typeRef))?.get(listId)
	}

	addListCache<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, cache: ListCache) {
		getFromMap(this._lists, typeRefToPath(typeRef), () => new Map()).set(listId, cache)
	}

	addElementEntity<T: ElementEntity>(typeRef: TypeRef<T>, id: Id, entity: T) {
		getFromMap(this._entities, typeRefToPath(typeRef), () => new Map()).set(id, entity)
	}

	isElementIdInCacheRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, id: Id): boolean {
		const cache = this.getListCache(typeRef, listId)
		return cache != null
			&& !firstBiggerThanSecond(id, cache.upperRangeId)
			&& !firstBiggerThanSecond(cache.lowerRangeId, id)
	}

	put(originalEntity: any): void {
		const entity = clone(originalEntity)
		const typeRef = entity._type
		const {listId, elementId} = expandId(entity._id)
		if (listId != null) {

			const cache = this.getListCache(typeRef, listId)
			if (cache == null) {
				// first element in this list
				const newCache = {
					allRange: [elementId],
					lowerRangeId: elementId,
					upperRangeId: elementId,
					elements: new Map([[elementId, entity]])
				}
				this.addListCache(typeRef, listId, newCache)
			} else {
				// if the element already exists in the cache, overwrite it
				// add new element to existing list if necessary
				cache.elements.set(elementId, entity)
				if (this.isElementIdInCacheRange(typeRef, listId, elementId)) {
					this._insertIntoRange(cache.allRange, elementId)
				}
			}
		} else {
			this.addElementEntity(typeRef, elementId, entity)
		}
	}

	_insertIntoRange(allRange: Array<Id>, elementId: Id) {
		for (let i = 0; i < allRange.length; i++) {
			const rangeElement = allRange[i]
			if (firstBiggerThanSecond(rangeElement, elementId)) {
				allRange.splice(i, 0, elementId)
				return
			}
			if (rangeElement === elementId) {
				return
			}
		}
		allRange.push(elementId)
	}

	provideFromListCache<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, start: Id, count: number, reverse: boolean): T[] {
		const listCache = this.getListCache(typeRef, listId)

		if (listCache == null) {
			// FIXME
			throw new Error("TODO")
		}

		let range = listCache.allRange
		let ids: Id[] = []
		if (reverse) {
			let i
			for (i = range.length - 1; i >= 0; i--) {
				if (firstBiggerThanSecond(start, range[i])) {
					break
				}
			}
			if (i >= 0) {
				let startIndex = i + 1 - count
				if (startIndex < 0) { // start index may be negative if more elements have been requested than available when getting elements reverse.
					startIndex = 0
				}
				ids = range.slice(startIndex, i + 1)
				ids.reverse()
			} else {
				ids = []
			}
		} else {
			const i = range.findIndex(id => firstBiggerThanSecond(id, start))
			ids = range.slice(i, i + count)
		}
		let result: T[] = []
		for (let a = 0; a < ids.length; a++) {
			result.push(clone((listCache.elements.get(ids[a]): any)))
		}
		return result
	}

	getRangeForList<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id): ?{lower: Id, upper: Id} {
		const listCache = this.getListCache(typeRef, listId)
		if (listCache == null) {
			return null
		}
		return {lower: listCache.lowerRangeId, upper: listCache.upperRangeId}
	}

	setUpperRangeForList<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, id: Id): void {
		const listCache = this.getListCache(typeRef, listId)
		if (listCache == null) {
			throw new Error("list does not exist")
		}
		listCache.upperRangeId = id
	}

	setLowerRangeForList<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, id: Id): void {
		const listCache = this.getListCache(typeRef, listId)
		if (listCache == null) {
			throw new Error("list does not exist")
		}
		listCache.lowerRangeId = id
	}

	/**
	 * Creates a new list cache if there is none. Resets everything but elements.
	 * @param typeRef
	 * @param listId
	 * @param lower
	 * @param upper
	 */
	setNewRangeForList<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, lower: Id, upper: Id): void {
		const listCache = this.getListCache(typeRef, listId)
		if (listCache == null) {
			this.addListCache(typeRef, listId, {allRange: [], lowerRangeId: lower, upperRangeId: upper, elements: new Map()})
		} else {
			listCache.lowerRangeId = lower
			listCache.upperRangeId = upper
			listCache.allRange = []
		}
	}

	getIdsInRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id): Array<Id> {
		return this.getListCache(typeRef, listId)?.allRange ?? []
	}
}


/**
 * This implementation provides a caching mechanism to the rest chain.
 * It forwards requests to the entity rest client.
 * The cache works as follows:
 * If a read from the target fails, the request fails.
 * If a read from the target is successful, the cache is written and the element returned.
 * For LETs the cache stores one range per list id. if a range is requested starting in the stored range or at the range ends the missing elements are loaded from the server.
 * Only ranges with elements with generated ids are stored in the cache. Custom id elements are only stored as single element currently. If needed this has to be extended for ranges.
 * Range requests starting outside the stored range are only allowed if the direction is away from the stored range. In this case we load from the range end to avoid gaps in the stored range.
 * Requests for creating or updating elements are always forwarded and not directly stored in the cache.
 * On EventBusClient notifications updated elements are stored in the cache if the element already exists in the cache.
 * On EventBusClient notifications new elements are only stored in the cache if they are LETs and in the stored range.
 * On EventBusClient notifications deleted elements are removed from the cache.
 *
 * Range handling:
 * |          <|>        c d e f g h i j k      <|>             |
 * MIN_ID  lowerRangeId     ids in rage    upperRangeId    MAX_ID
 * lowerRangeId may be anything from MIN_ID to c, upperRangeId may be anything from k to MAX_ID
 */
export class EntityRestCache implements EntityRestInterface {

	_ignoredTypes: TypeRef<any>[];

	_entityRestClient: EntityRestInterface;

	_storage: CacheStorage;

	constructor(entityRestClient: EntityRestInterface) {
		this._entityRestClient = entityRestClient
		this._ignoredTypes = [
			EntityEventBatchTypeRef, PermissionTypeRef, BucketPermissionTypeRef, SessionTypeRef,
			SecondFactorTypeRef, RecoverCodeTypeRef, RejectedSenderTypeRef,
		]
		this._storage = new CacheStorage()
	}

	async load<T: SomeEntity>(typeRef: TypeRef<T>, id: $PropertyType<T, "_id">, queryParameters: ?Params, extraHeaders?: Params): Promise<T> {
		const {listId, elementId} = expandId(id)

		if (
			typeRef.app === "monitor"
			|| queryParameters?.version != null //if a specific version is requested we have to load again
			|| !this._storage.contains(typeRef, listId, elementId)
			|| this._ignoredTypes.some(ref => isSameTypeRef(typeRef, ref))
		) {
			return this._entityRestClient.load(typeRef, id, queryParameters, extraHeaders)
		}
		//TODO
		// Some methods like "createDraft" load the created instance directly after the service has completed.
		// Currently we cannot apply this optimization here because the cache is not updated directly after a service request because
		// We don't wait for the update/create event of the modified instance.
		// We can add this optimization again if our service requests resolve after the cache has been updated
		//} else if (listId && this._isInCacheRange(typeRefToPath(typeRef), listId, id)) {
		//return Promise.reject(new NotFoundError("Instance not found but in the cache range: " + listId + " " + id))
		return this._storage.get(typeRef, listId, elementId)
	}

	async loadRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, start: Id, count: number, reverse: boolean): Promise<T[]> {
		const typeModel = await resolveTypeReference(typeRef)
		if (
			typeRef.app === "monitor"
			|| this._ignoredTypes.some(ref => isSameTypeRef(typeRef, ref))
			|| typeModel.values._id.type !== ValueType.GeneratedId // we currently only store ranges for generated ids
		) {
			return this._entityRestClient.loadRange(typeRef, listId, start, count, reverse)
		}

		return this._loadRange(typeRef, listId, start, count, reverse)
	}

	loadMultiple<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, elementIds: Array<Id>): Promise<Array<T>> {
		if (
			typeRef.app === "monitor"
			|| this._ignoredTypes.some(ref => isSameTypeRef(typeRef, ref))
		) {
			return this._entityRestClient.loadMultiple(typeRef, listId, elementIds)
		}

		return this._loadMultiple(typeRef, listId, elementIds)
	}

	setup<T: SomeEntity>(listId: ?Id, instance: T, extraHeaders?: Params): Promise<Id> {
		return this._entityRestClient.setup(listId, instance, extraHeaders)
	}

	setupMultiple<T: SomeEntity>(listId: ?Id, instances: Array<T>): Promise<Array<Id>> {
		return this._entityRestClient.setupMultiple(listId, instances)
	}

	update<T: SomeEntity>(instance: T): Promise<void> {
		return this._entityRestClient.update(instance)
	}

	erase<T: SomeEntity>(instance: T): Promise<void> {
		return this._entityRestClient.erase(instance)
	}

	/**
	 * Delete a cached entity. Sometimes this is necessary to do to ensure you always load the new version
	 */
	deleteFromCacheIfExists<T>(typeRef: TypeRef<T>, listId: ?Id, elementId: Id) {
		this._storage.deleteIfExists(typeRef, listId, elementId)
	}

	async _loadMultiple<T: SomeEntity>(typeRef: TypeRef<T>, listId: ?Id, ids: Array<Id>): Promise<Array<T>> {
		const entitiesInCache = []
		const idsToLoad = []
		for (let id of ids) {
			if (this._storage.contains(typeRef, listId, id)) {
				entitiesInCache.push(this._storage.get(typeRef, listId, id))
			} else {
				idsToLoad.push(id)
			}
		}
		const entitiesFromServer = []
		if (idsToLoad.length > 0) {
			const entities = await this._entityRestClient.loadMultiple(typeRef, listId, idsToLoad)
			for (let entity of entities) {
				this._storage.put(entity)
				entitiesFromServer.push(entity)
			}
		}

		return entitiesFromServer.concat(entitiesInCache)
	}

	async _loadRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, start: Id, count: number, reverse: boolean): Promise<T[]> {

		const range = this._storage.getRangeForList(typeRef, listId)

		if (range == null) {

			// Create a new range and load everything
			const entities = await this._entityRestClient.loadRange(typeRef, listId, start, count, reverse)

			// Initialize a new range for this list
			this._storage.setNewRangeForList(typeRef, listId, start, start)

			// The range bounds will be updated in here
			return this._handleElementRangeResult(typeRef, listId, start, count, reverse, entities, count)
		} else {

			const startIsLocatedInRange = !firstBiggerThanSecond(start, range.upper) && !firstBiggerThanSecond(range.lower, start)

			if (startIsLocatedInRange) {
				const {newStart, newCount} = this._recalculateRangeRequest(typeRef, listId, start, count, reverse)
				if (newCount > 0) {
					// We will be able to provide some entities from the cache, so we just want to load the remaining entities from the server
					const entities = await this._entityRestClient.loadRange(typeRef, listId, newStart, newCount, reverse)
					return this._handleElementRangeResult(typeRef, listId, start, count, reverse, entities, newCount)
				} else {
					// all elements are located in the cache.
					return this._storage.provideFromListCache(typeRef, listId, start, count, reverse)
				}
			} else {

				const isLoadingAwayFromRange = (reverse && start < range.lower) || (!reverse && start > range.upper)

				if (isLoadingAwayFromRange) {
					// Start is outside the range, and we are loading away from the range, so we grow until we are able to provide enough
					// entities starting at startId

					// Which end of the range to start loading from
					const loadStartId = reverse
						? range.lower
						: range.upper

					// Load from the end of the range in the direction of the startId. then, if all available elements have been loaded or the requested number is in cache, return from cache. otherwise load again the same way.
					const entities = await this._entityRestClient.loadRange(typeRef, listId, loadStartId, count, reverse)

					// put the new elements into the cache
					this._handleElementRangeResult(typeRef, listId, loadStartId, count, reverse, ((entities: any): T[]), count)

					// provide from cache with the actual start id
					const resultElements = this._storage.provideFromListCache(typeRef, listId, start, count, reverse)

					if (entities.length < count || resultElements.length === count) {
						// either all available elements have been loaded from target or the requested number of elements could be provided from cache
						return resultElements
					} else {
						// try again with the new elements in the cache
						return this.loadRange(typeRef, listId, start, count, reverse)
					}
				} else {
					// Start is outside the range, and we are loading towards the range, so grow outward from the range until start is
					// inside the range, then provide from cache

					const loadStartId = reverse
						? range.upper
						: range.lower

					const entities = await this._entityRestClient.loadRange(typeRef, listId, loadStartId, count, !reverse)

					this._handleElementRangeResult(typeRef, listId, loadStartId, count, !reverse, entities, count)

					if (!this._storage.isElementIdInCacheRange(typeRef, listId, start)) {
						return this.loadRange(typeRef, listId, start, count, reverse)
					} else {
						return this._storage.provideFromListCache(typeRef, listId, start, count, reverse)
					}
				}
			}
		}
	}

	_handleElementRangeResult<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, start: Id, count: number, reverse: boolean, elements: T[], targetCount: number): T[] {
		let elementsToAdd = elements
		if (reverse) {
			// Ensure that elements are cached in ascending (not reverse) order
			elementsToAdd = elements.reverse()
			if (elements.length < targetCount) {
				this._storage.setLowerRangeForList(typeRef, listId, GENERATED_MIN_ID)
			} else {
				// After reversing the list the first element in the list is the lower range limit
				this._storage.setLowerRangeForList(typeRef, listId, getLetId(elements[0])[1])
			}
		} else {
			// Last element in the list is the upper range limit
			if (elements.length < targetCount) {
				// all elements have been loaded, so the upper range must be set to MAX_ID
				this._storage.setUpperRangeForList(typeRef, listId, GENERATED_MAX_ID)
			} else {
				this._storage.setUpperRangeForList(typeRef, listId, getLetId(elements[elements.length - 1])[1])
			}
		}

		for (let element of elementsToAdd) {
			this._storage.put(element)
		}

		return this._storage.provideFromListCache(typeRef, listId, start, count, reverse)
	}

	/**
	 * Calculates the new start value for the getElementRange request and the number of elements to read in
	 * order to read no duplicate values.
	 * @return returns the new start and count value.
	 */
	_recalculateRangeRequest<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, start: Id, count: number, reverse: boolean): {newStart: string, newCount: number} {
		let allRangeList = this._storage.getIdsInRange(typeRef, listId)
		let elementsToRead = count
		let startElementId = start
		const range = this._storage.getRangeForList(typeRef, listId)
		if (range == null) {
			return {newStart: start, newCount: count}
		}
		const {lower, upper} = range
		let indexOfStart = allRangeList.indexOf(start)
		if ((!reverse && upper === GENERATED_MAX_ID) || (reverse && lower === GENERATED_MIN_ID)) {
			// we have already loaded the complete range in the desired direction, so we do not have to load from server
			elementsToRead = 0
		} else if (allRangeList.length === 0) { // Element range is empty, so read all elements
			elementsToRead = count
		} else if (indexOfStart !== -1) { // Start element is located in allRange read only elements that are not in allRange.
			if (reverse) {
				elementsToRead = count - indexOfStart
				startElementId = allRangeList[0] // use the lowest id in allRange as start element
			} else {
				elementsToRead = count - (allRangeList.length - 1 - indexOfStart)
				startElementId = allRangeList[allRangeList.length - 1] // use the  highest id in allRange as start element
			}
		} else if (
			lower === start
			|| (firstBiggerThanSecond(start, lower) && (firstBiggerThanSecond(allRangeList[0], start)))
		) { // Start element is not in allRange but has been used has start element for a range request, eg. EntityRestInterface.GENERATED_MIN_ID, or start is between lower range id and lowest element in range
			if (!reverse) { // if not reverse read only elements that are not in allRange
				startElementId = allRangeList[allRangeList.length - 1] // use the  highest id in allRange as start element
				elementsToRead = count - allRangeList.length
			}
			// if reverse read all elements
		} else if (upper === start
			|| (firstBiggerThanSecond(start, allRangeList[allRangeList.length - 1])
				&& (firstBiggerThanSecond(upper, start)))
		) { // Start element is not in allRange but has been used has start element for a range request, eg. EntityRestInterface.GENERATED_MAX_ID, or start is between upper range id and highest element in range
			if (reverse) { // if not reverse read only elements that are not in allRange
				startElementId = allRangeList[0] // use the  highest id in allRange as start element
				elementsToRead = count - allRangeList.length
			}
			// if not reverse read all elements
		}
		return {newStart: startElementId, newCount: elementsToRead}
	}


	/**
	 * Resolves when the entity is loaded from the server if necessary
	 * @pre The last call of this function must be resolved. This is needed to avoid that e.g. while
	 * loading a created instance from the server we receive an update of that instance and ignore it because the instance is not in the cache yet.
	 *
	 * @return Promise, which resolves to the array of valid events (if response is NotFound or NotAuthorized we filter it out)
	 */
	async entityEventsReceived(batch: $ReadOnlyArray<EntityUpdate>): Promise<Array<EntityUpdate>> {
		// we handle post multiple create operations separately to optimize the number of requests with getMultiple
		const createUpdatesForLETs = []
		const regularUpdates = [] // all updates not resulting from post multiple requests
		batch.forEach(update => {
			if (update.application !== "monitor") {//monitor application is ignored
				if (update.operation === OperationType.CREATE && update.instanceListId != null
					// mails are ignores because move operation are handled as a special event (and no post multiple is possible)
					&& !isSameTypeRef(new TypeRef(update.application, update.type), MailTypeRef)) {
					createUpdatesForLETs.push(update)
				} else {
					regularUpdates.push(update)
				}
			}
		})
		const createUpdatesForLETsPerList = groupBy(createUpdatesForLETs, (update) => update.instanceListId)

		const postMultipleEventUpdates = []
		// we first handle potential post multiple updates in get multiple requests
		for (let [instanceListId, updates] of createUpdatesForLETsPerList) {
			const firstUpdate = updates[0]
			const typeRef = new TypeRef(firstUpdate.application, firstUpdate.type)
			const ids = updates.map(update => update.instanceId)

			//We only want to load the instances that are in cache range
			const idsInCacheRange = this.getElementIdsInCacheRange(typeRef, instanceListId, ids)
			if (idsInCacheRange.length === 0) {
				postMultipleEventUpdates.push(updates)
			} else {

				const updatesNotInCacheRange = idsInCacheRange.length === updates.length
					? []
					: updates.filter(update => !idsInCacheRange.includes(update.instanceId))

				try {
					// loadMultiple is only called to cache the elements and check which ones return errors
					const returnedInstances = await this._loadMultiple(typeRef, instanceListId, idsInCacheRange)
					//We do not want to pass updates that caused an error
					if (returnedInstances.length !== idsInCacheRange.length) {
						const returnedIds = returnedInstances.map(instance => getElementId(instance))
						postMultipleEventUpdates.push(updates.filter(update => returnedIds.includes(update.instanceId)).concat(updatesNotInCacheRange))
					} else {
						postMultipleEventUpdates.push(updates)
					}
				} catch (e) {
					if (e instanceof NotAuthorizedError) {
						// return updates that are not in cache Range if NotAuthorizedError (for those updates that are in cache range)
						postMultipleEventUpdates.push(updatesNotInCacheRange)
					} else {
						throw e
					}
				}
			}
		}

		const otherEventUpdates = []
		for (let update of regularUpdates) {
			const {instanceListId, instanceId, operation, type, application} = update
			const typeRef = new TypeRef(application, type)

			let handledUpdate
			switch (operation) {
				case OperationType.UPDATE:
					handledUpdate = await this._processUpdateEvent(typeRef, update)
					if (handledUpdate) {
						otherEventUpdates.push(handledUpdate)
					}
					continue
				case OperationType.DELETE:
					if (isSameTypeRef(MailTypeRef, typeRef) && containsEventOfType(batch, OperationType.CREATE, instanceId)) {
						// move for mail is handled in create event.
					} else {
						this._storage.deleteIfExists(typeRef, instanceListId, instanceId)
						otherEventUpdates.push(update)
					}
					continue
				case OperationType.CREATE:
					handledUpdate = await this._processCreateEvent(typeRef, update, batch)
					if (handledUpdate) {
						otherEventUpdates.push(handledUpdate)
					}
					continue
				default:
					throw new ProgrammingError("Unknown operation type: " + operation)
			}
		}

		// merge the results
		return otherEventUpdates.concat(flat(postMultipleEventUpdates))
	}

	_processCreateEvent(
		typeRef: TypeRef<*>,
		update: EntityUpdate,
		batch: $ReadOnlyArray<EntityUpdate>,
	): $Promisable<EntityUpdate | null> { // do not return undefined to avoid implicit returns
		const {instanceListId, instanceId} = update

		// We put new instances into cache only when it's a new instance in the cached range which is only for the list instances.
		if (instanceListId) {
			const deleteEvent = getEventOfType(batch, OperationType.DELETE, instanceId)
			if (deleteEvent && isSameTypeRef(MailTypeRef, typeRef)
				&& this._storage.contains(typeRef, deleteEvent.instanceListId, instanceId)) {
				// It is a move event for cached mail
				const element = this._storage.get(typeRef, deleteEvent.instanceListId, instanceId)
				this._storage.deleteIfExists(typeRef, deleteEvent.instanceListId, instanceId)
				element._id = [instanceListId, instanceId]
				this._storage.put(element)
				return update
			} else if (this._storage.isElementIdInCacheRange(typeRef, instanceListId, instanceId)) {
				// No need to try to download something that's not there anymore
				return this._entityRestClient.load(typeRef, [instanceListId, instanceId])
				           .then(entity => this._storage.put(entity))
				           .then(() => update)
				           .catch((e) => this._handleProcessingError(e))
			} else {
				return update
			}
		} else {
			return update
		}
	}

	_processUpdateEvent(typeRef: TypeRef<*>, update: EntityUpdate): $Promisable<EntityUpdate | null> {
		const {instanceListId, instanceId} = update
		if (this._storage.contains(typeRef, instanceListId, instanceId)) {
			// No need to try to download something that's not there anymore
			return this._entityRestClient.load(typeRef, collapseId(instanceListId, instanceId))
			           .then(entity => this._storage.put(entity))
			           .then(() => update)
			           .catch((e) => this._handleProcessingError(e))
		}
		return update
	}

	/**
	 * @returns {null} to avoid implicit returns where it is called
	 */
	_handleProcessingError(e: Error): null {
		if (e instanceof NotFoundError || e instanceof NotAuthorizedError) {
			return null
		} else {
			throw e
		}
	}

	/**
	 *
	 * @returns {Array<Id>} the ids that are in cache range and therefore should be cached
	 */
	getElementIdsInCacheRange<T: ListElementEntity>(typeRef: TypeRef<T>, listId: Id, ids: Id[]): Id[] {
		return ids.filter(id => this._storage.isElementIdInCacheRange(typeRef, listId, id))
	}
}

export function expandId(id: Id | IdTuple): {listId: ?Id, elementId: Id} {
	if (typeof id === "string") {
		return {
			listId: null,
			elementId: id
		}
	} else {
		const [listId, elementId] = id
		return {
			listId, elementId
		}
	}
}

export function collapseId(listId: ?Id, elementId: Id): Id | IdTuple {
	if (listId != null) {
		return [listId, elementId]
	} else {
		return elementId
	}
}