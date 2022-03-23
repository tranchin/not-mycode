import {addParamsToUrl, isSuspensionResponse, RestClient} from "../rest/RestClient"
import {encryptBytes, resolveSessionKey} from "../crypto/CryptoFacade"
import {concat, neverNull, promiseMap, splitUint8ArrayInChunks, TypeRef, uint8ArrayToBase64} from "@tutao/tutanota-utils"
import {LoginFacadeImpl} from "./LoginFacade"
import {ArchiveDataType, MAX_BLOB_SIZE_BYTES} from "../../common/TutanotaConstants"
import {_TypeModel as BlobGetInTypeModel, createBlobGetIn} from "../../entities/storage/BlobGetIn"

import {HttpMethod, MediaType, resolveTypeReference} from "../../common/EntityFunctions"
import {assertWorkerOrNode, isApp, isDesktop} from "../../common/Env"
import type {SuspensionHandler} from "../SuspensionHandler"
import {StorageService} from "../../entities/storage/Services"
import {serviceRequest} from "../ServiceRequestWorker"
import {createBlobAccessTokenData} from "../../entities/storage/BlobAccessTokenData"
import {BlobAccessTokenReturnTypeRef} from "../../entities/storage/BlobAccessTokenReturn"
import {createBlobWriteData} from "../../entities/storage/BlobWriteData"
import {aes128Decrypt, bitArrayToUint8Array, random, sha256Hash} from "@tutao/tutanota-crypto"
import type {NativeFileApp} from "../../../native/common/FileApp"
import type {AesApp} from "../../../native/worker/AesApp"
import {InstanceMapper} from "../crypto/InstanceMapper"
import {StorageServerAccessInfo} from "../../entities/storage/StorageServerAccessInfo"
import {locator} from "../WorkerLocator"
import {BlobPutOut, BlobPutOutTypeRef} from "../../entities/storage/BlobPutOut"
import {createBlobReadData} from "../../entities/storage/BlobReadData"
import {Aes128Key} from "@tutao/tutanota-crypto/dist/encryption/Aes"
import {Blob} from "../../entities/sys/Blob"
import {FileReference} from "../../common/utils/FileUtils"
import {handleRestError} from "../../common/error/RestError"
import {StorageServerUrl} from "../../entities/storage/StorageServerUrl"
import {File} from "../../entities/tutanota/File"

assertWorkerOrNode()
const BLOB_SERVICE_REST_PATH = `/rest/storage/${StorageService.BlobService}`

export type ReferenceToken = string

export type Instance = {
	_type: TypeRef<File>;
	_ownerEncSessionKey: null | Uint8Array;
	_ownerGroup: null | Id;
	_id: Id | IdTuple;
}

export class BlobFacade {
	_login: LoginFacadeImpl
	_restClient: RestClient
	_suspensionHandler: SuspensionHandler
	_fileApp: NativeFileApp
	_aesApp: AesApp
	_instanceMapper: InstanceMapper

	constructor(
		login: LoginFacadeImpl,
		restClient: RestClient,
		suspensionHandler: SuspensionHandler,
		fileApp: NativeFileApp,
		aesApp: AesApp,
		instanceMapper: InstanceMapper,
	) {
		this._login = login
		this._restClient = restClient
		this._suspensionHandler = suspensionHandler
		this._fileApp = fileApp
		this._aesApp = aesApp
		this._instanceMapper = instanceMapper
	}

	/**
	 * blobData might be sliced into multiple smaller blobs before uploading
	 * @returns blobReferenceToken
	 */
	async encryptAndUpload(archiveDataType: ArchiveDataType, blobData: Uint8Array, ownerGroupId: Id, sessionKey: Aes128Key): Promise<ReferenceToken[]> {
		const blobAccessInfo = await this.getUploadToken(archiveDataType, ownerGroupId)
		const chunks = splitUint8ArrayInChunks(MAX_BLOB_SIZE_BYTES, blobData)
		return promiseMap(chunks, async (chunk) => await this.encryptAndUploadChunk(chunk, blobAccessInfo, sessionKey))
	}

	async encryptAndUploadNative(archiveDataType: ArchiveDataType, fileReference: FileReference, ownerGroupId: Id, sessionKey: Aes128Key): Promise<ReferenceToken[]> {
		if (!isApp() && !isDesktop()) {
			return Promise.reject("Environment is not app or Desktop!")
		}
		const blobAccessInfo = await this.getUploadToken(archiveDataType, ownerGroupId)
		const fileReferenceChunkUris = await this._fileApp.splitFile(fileReference, MAX_BLOB_SIZE_BYTES)
		return promiseMap(fileReferenceChunkUris, async (fileReferenceChunkUri) => {
			const {uri} = await this._aesApp.aesEncryptFile(sessionKey, fileReferenceChunkUri, random.generateRandomData(16))
			const fileReferenceEncryptedChunk = await this._fileApp.uriToFileRef(uri)
			return this.encryptAndUploadNativeChunk(fileReferenceEncryptedChunk, blobAccessInfo, sessionKey)
		})
	}

	private async encryptAndUploadChunk(chunk: Uint8Array, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key) {
		const {blobAccessToken, servers} = blobAccessInfo
		const encryptedData = encryptBytes(sessionKey, chunk)
		const blobHash = uint8ArrayToBase64(sha256Hash(encryptedData).slice(0, 6))
		const headers = Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this._login.createAuthHeaders(),
		)
		let error = null
		for (const server of servers) {
			try {
				const response = await this._restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.PUT,
					{
						queryParams: {
							blobHash
						},
						headers,
						body: encryptedData,
						responseType: MediaType.Json,
						baseUrl: server.url,
					})
				return await this.parseBlobPutOutResponse(response)
			} catch (e) {
				error = e
				console.log(`can't upload to server ${server.url}`, e)
			}
		}
		throw error
	}

	private async encryptAndUploadNativeChunk(fileReferenceChunk: FileReference, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<string> {
		const {blobAccessToken, servers} = blobAccessInfo
		const {uri} = await this._aesApp.aesEncryptFile(sessionKey, fileReferenceChunk.location, random.generateRandomData(16))
		const fileReferenceEncryptedChunk = await this._fileApp.uriToFileRef(uri)
		const blobHash = await this._fileApp.hashFile(fileReferenceEncryptedChunk.name)

		const headers = Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this._login.createAuthHeaders(),
		)
		let error = null
		for (const server of servers) {
			try {
				const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, server.url)
				const fullUrl = addParamsToUrl(serviceUrl, {blobHash})
				const response = await this.uploadNative(fileReferenceEncryptedChunk.location, fullUrl, headers);
				return await this.parseBlobPutOutResponse(response)
			} catch (e) {
				error = e
				console.log(`can't upload to server from native ${server.url}`, e)
			}
		}
		throw error
	}

	private async uploadNative(location: string, fullUrl: URL, headers: Dict): Promise<string> {
		if (this._suspensionHandler.isSuspended()) {
			return this._suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrl, headers))
		}
		const {
			suspensionTime,
			responseBody,
			statusCode,
			errorId,
			precondition
		} = await this._fileApp.upload(location, fullUrl.toString(), headers) // blobReferenceToken in the response body

		if (statusCode === 200 && responseBody != null) {
			return this.parseBlobPutOutResponse(responseBody)
		} else if (responseBody == null) {
			throw new Error("no response body")
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this._suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this._suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrl, headers))
		} else {
			throw handleRestError(statusCode, ` | PUT ${fullUrl.toString()} failed to natively upload blob`, errorId, precondition)
		}
	}

	private async parseBlobPutOutResponse(data: string): Promise<ReferenceToken> {
		const responseTypeModel = await resolveTypeReference(BlobPutOutTypeRef)
		const instance = JSON.parse(data)
		const response = await locator.instanceMapper.decryptAndMapToInstance<BlobPutOut>(responseTypeModel, instance, null)
		return response.blobReferenceToken
	}

	async downloadAndDecrypt(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance): Promise<Uint8Array> {
		const archiveId = this.getArchiveId(blobs)
		// FIXME download from other archive
		const blobAccessInfo = await this.getDownloadTokenOwnArchive(archiveDataType, archiveId)
		const sessionKey = neverNull(await resolveSessionKey(await resolveTypeReference(referencingInstance._type), referencingInstance))
		const blobData = await promiseMap(blobs, (blob) => this.downloadAndDecryptChunk(blob, blobAccessInfo, sessionKey))
		return concat(...blobData)
	}

	async downloadAndDecryptNative(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance, fileName: string, mimeType: string): Promise<FileReference> {
		if (!isApp() && !isDesktop()) {
			return Promise.reject("Environment is not app or Desktop!")
		}
		const archiveId = this.getArchiveId(blobs)
		// FIXME download from other archive
		const blobAccessInfo = await this.getDownloadTokenOwnArchive(archiveDataType, archiveId)
		const sessionKey = neverNull(await resolveSessionKey(await resolveTypeReference(referencingInstance._type), referencingInstance))
		const decryptedChunkFileUris = await promiseMap(blobs, (blob) => this.downloadAndDecryptChunkNative(blob, blobAccessInfo, sessionKey))
		// now decryptedChunkFileUris has the correct order of downloaded blobs, and we need to tell native to join them
		// check if output already exists and return cached?

		const decryptedFileUri = await this._fileApp.joinFiles(fileName, decryptedChunkFileUris)
		const size = await this._fileApp.getSize(decryptedFileUri)
		for (const tmpBlobFile of decryptedChunkFileUris) {
			await this._fileApp.deleteFile(tmpBlobFile)
		}
		return {
			_type: "FileReference",
			name: fileName,
			mimeType,
			size,
			location: decryptedFileUri,
		}
	}

	private async downloadAndDecryptChunk(blob: Blob, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<Uint8Array> {
		const {blobAccessToken, servers} = blobAccessInfo
		const {archiveId, blobId} = blob
		const headers = Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this._login.createAuthHeaders(),
		)
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const literalGetData = await this._instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
		const body = JSON.stringify(literalGetData)

		let error = null
		for (const server of servers) {
			try {
				const data = await this._restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.GET, {
					headers,
					body,
					responseType: MediaType.Binary,
					baseUrl: server.url,
				})
				return aes128Decrypt(sessionKey, data)
			} catch (e) {
				error = e
				console.log(`can't download from server ${server}`)
			}
		}
		throw error
	}

	private async downloadAndDecryptChunkNative(blob: Blob, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<string> {
		const {blobAccessToken, servers} = blobAccessInfo
		const {archiveId, blobId} = blob
		const headers = Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this._login.createAuthHeaders(),
		)
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const literalGetData = await this._instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
		const body = JSON.stringify(literalGetData)
		const blobFilename = blobId + ".blob"
		let error = null
		for (const server of servers) {
			try {
				return this.downloadNative(server, body, headers, sessionKey, blobFilename)
			} catch (e) {
				error = e
				console.log(`can't download from server ${server}`)
			}
		}
		throw error
	}

	/**
	 * @return the uri of the decrypted blob
	 */
	private async downloadNative(server: StorageServerUrl, body: string, headers: Dict, sessionKey: Aes128Key, fileName: string): Promise<string> {
		if (this._suspensionHandler.isSuspended()) {
			return this._suspensionHandler.deferRequest(() => this.downloadNative(server, body, headers, sessionKey, fileName))
		}

		const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, server.url)
		const url = addParamsToUrl(serviceUrl, {"_body": body})
		const {statusCode, encryptedFileUri, suspensionTime, errorId, precondition} = await this._fileApp.download(url.toString(), fileName, headers)
		if (statusCode == 200 && encryptedFileUri != null) {
			const decryptedFileUrl = await this._aesApp.aesDecryptFile(sessionKey, encryptedFileUri)
			if (encryptedFileUri != null) {
				try {
					await this._fileApp.deleteFile(encryptedFileUri)
				} catch {
					console.log("Failed to delete encrypted file", encryptedFileUri)
				}
			}
			return decryptedFileUrl
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this._suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this._suspensionHandler.deferRequest(() => this.downloadNative(server, body, headers, sessionKey, fileName))
		} else {
			throw handleRestError(statusCode, ` | GET failed to natively download attachment`, errorId, precondition)
		}
	}

	private getArchiveId(blobs: Blob[]) {
		if (blobs.length == 0) {
			throw new Error("must pass blobs")
		}
		let archiveIds = new Set(blobs.map(b => b.archiveId))
		if (archiveIds.size != 1) {
			throw new Error(`only one archive id allowed, but was ${archiveIds}`)
		}
		const archiveId = blobs[0].archiveId
		return archiveId
	}

	async getUploadToken(archiveDataType: ArchiveDataType, ownerGroupId: Id): Promise<StorageServerAccessInfo> {
		const tokenRequest = createBlobAccessTokenData({
			archiveDataType,
			write: createBlobWriteData({
				archiveOwnerGroup: ownerGroupId,
			}),
		})
		const {storageAccessInfo} = await serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest, BlobAccessTokenReturnTypeRef)
		return storageAccessInfo
	}

	async getDownloadTokenOwnArchive(archiveDataType: ArchiveDataType, archiveId: Id): Promise<StorageServerAccessInfo> {
		const tokenRequest = createBlobAccessTokenData({
			archiveDataType,
			read: createBlobReadData({
				archiveId,
			}),
		})
		const {storageAccessInfo} = await serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest, BlobAccessTokenReturnTypeRef)
		return storageAccessInfo
	}

	// TODO native
	// TODO reset FileFacade
}