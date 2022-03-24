import {addParamsToUrl, isSuspensionResponse, RestClient} from "../rest/RestClient"
import {CryptoFacade, encryptBytes} from "../crypto/CryptoFacade"
import {concat, decodeBase64, downcast, neverNull, promiseMap, splitUint8ArrayInChunks, uint8ArrayToBase64} from "@tutao/tutanota-utils"
import {LoginFacadeImpl} from "./LoginFacade"
import {ArchiveDataType, MAX_BLOB_SIZE_BYTES} from "../../common/TutanotaConstants"
import {_TypeModel as BlobGetInTypeModel, createBlobGetIn} from "../../entities/storage/BlobGetIn"

import {HttpMethod, MediaType, resolveTypeReference} from "../../common/EntityFunctions"
import {assertWorkerOrNode, isApp, isDesktop} from "../../common/Env"
import type {SuspensionHandler} from "../SuspensionHandler"
import {StorageService} from "../../entities/storage/Services"
import {createBlobAccessTokenData} from "../../entities/storage/BlobAccessTokenData"
import {BlobAccessTokenReturnTypeRef} from "../../entities/storage/BlobAccessTokenReturn"
import {createBlobWriteData} from "../../entities/storage/BlobWriteData"
import {aes128Decrypt, random, sha256Hash} from "@tutao/tutanota-crypto"
import type {FileUri, NativeFileApp} from "../../../native/common/FileApp"
import type {AesApp} from "../../../native/worker/AesApp"
import {InstanceMapper} from "../crypto/InstanceMapper"
import {StorageServerAccessInfo} from "../../entities/storage/StorageServerAccessInfo"
import {BlobPutOut, BlobPutOutTypeRef} from "../../entities/storage/BlobPutOut"
import {createBlobReadData} from "../../entities/storage/BlobReadData"
import {Aes128Key} from "@tutao/tutanota-crypto/dist/encryption/Aes"
import {Blob} from "../../entities/sys/Blob"
import {FileReference} from "../../common/utils/FileUtils"
import {handleRestError} from "../../common/error/RestError"
import {StorageServerUrl} from "../../entities/storage/StorageServerUrl"
import {Instance} from "../../common/EntityTypes"
import {getElementId, getEtId, getListId, isElementEntity} from "../../common/utils/EntityUtils"
import {createInstanceId} from "../../entities/storage/InstanceId.js"
import {ServiceRestInterface} from "../rest/ServiceRestInterface"

assertWorkerOrNode()
export const BLOB_SERVICE_REST_PATH = `/rest/storage/${StorageService.BlobService}`

export type ReferenceToken = string

/**
 * The BlobFacade uploads and downloads blobs to/from the blob store.
 *
 * It requests tokens from the BlobAccessTokenService and download and uploads the blobs to/from the BlobService.
 *
 * In case of upload it is necessary to make a request to the BlobReferenceService or use the referenceTokens returned by the BlobService PUT in some other service call.
 * Otherwise the blobs will automatically be deleted after some time. It is not allowed to reference blobs manually in some instance.
 */
export class BlobFacade {
	private readonly login: LoginFacadeImpl
	private readonly service: ServiceRestInterface
	private readonly restClient: RestClient
	private readonly suspensionHandler: SuspensionHandler
	private readonly fileApp: NativeFileApp
	private readonly aesApp: AesApp
	private readonly instanceMapper: InstanceMapper
	private readonly cryptoFacade: CryptoFacade

	constructor(
		login: LoginFacadeImpl,
		service: ServiceRestInterface,
		restClient: RestClient,
		suspensionHandler: SuspensionHandler,
		fileApp: NativeFileApp,
		aesApp: AesApp,
		instanceMapper: InstanceMapper,
		cryptoFacade: CryptoFacade
	) {
		this.login = login
		this.service = service
		this.restClient = restClient
		this.suspensionHandler = suspensionHandler
		this.fileApp = fileApp
		this.aesApp = aesApp
		this.instanceMapper = instanceMapper
		this.cryptoFacade = cryptoFacade
	}

	/**
	 * Encrypts and uploads binary data to the blob store. The binary data is split into multiple blobs in case it
	 * is too big.
	 *
	 * @returns blobReferenceToken that must be used to reference a blobs from an instance. Only to be used once.
	 */
	async encryptAndUpload(archiveDataType: ArchiveDataType, blobData: Uint8Array, ownerGroupId: Id, sessionKey: Aes128Key): Promise<ReferenceToken[]> {
		const blobAccessInfo = await this.requestWriteToken(archiveDataType, ownerGroupId)
		const chunks = splitUint8ArrayInChunks(MAX_BLOB_SIZE_BYTES, blobData)
		return promiseMap(chunks, async (chunk) => await this.encryptAndUploadChunk(chunk, blobAccessInfo, sessionKey))
	}

	/**
	 * Encrypts and uploads binary data stored as a file to the blob store. The binary data is split into multiple blobs in case it
	 * is too big.
	 *
	 * @returns blobReferenceToken that must be used to reference a blobs from an instance. Only to be used once.
	 */
	async encryptAndUploadNative(archiveDataType: ArchiveDataType, fileUri: FileUri, ownerGroupId: Id, sessionKey: Aes128Key): Promise<ReferenceToken[]> {
		if (!isApp() && !isDesktop()) {
			return Promise.reject("Environment is not app or Desktop!")
		}
		const blobAccessInfo = await this.requestWriteToken(archiveDataType, ownerGroupId)
		const chunkUris = await this.fileApp.splitFile(fileUri, MAX_BLOB_SIZE_BYTES)
		return promiseMap(chunkUris, async (chunkUri) => {
			return this.encryptAndUploadNativeChunk(chunkUri, blobAccessInfo, sessionKey)
		})
	}

	/**
	 * Downloads multiple blobs, decrypts and joins them to unencrypted binary data.
	 *
	 * @param archiveDataType
	 * @param blobs to be retrieved
	 * @param referencingInstance that directly references the blobs
	 * @returns Uint8Array unencrypted binary data
	 */
	async downloadAndDecrypt(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance): Promise<Uint8Array> {
		const blobAccessInfo = await this.requestReadToken(archiveDataType, blobs, referencingInstance)
		const sessionKey = neverNull(await this.cryptoFacade.resolveSessionKey(await resolveTypeReference(referencingInstance._type), referencingInstance))
		const blobData = await promiseMap(blobs, (blob) => this.downloadAndDecryptChunk(blob, blobAccessInfo, sessionKey))
		return concat(...blobData)
	}

	/**
	 * Downloads multiple blobs, decrypts and joins them to unencrypted binary data which will be stored as a file on the
	 * device.
	 *
	 * @param archiveDataType
	 * @param blobs to be retrieved
	 * @param referencingInstance that directly references the blobs
	 * @param fileName is written to the returned FileReference
	 * @param mimeType is written to the returned FileReference
	 * @returns FileReference to the unencrypted binary data
	 */
	async downloadAndDecryptNative(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance, fileName: string, mimeType: string): Promise<FileReference> {
		if (!isApp() && !isDesktop()) {
			return Promise.reject("Environment is not app or Desktop!")
		}
		const blobAccessInfo = await this.requestReadToken(archiveDataType, blobs, referencingInstance)
		const sessionKey = neverNull(await this.cryptoFacade.resolveSessionKey(await resolveTypeReference(referencingInstance._type), referencingInstance))
		const decryptedChunkFileUris = await promiseMap(blobs, (blob) => this.downloadAndDecryptChunkNative(blob, blobAccessInfo, sessionKey))
		// now decryptedChunkFileUris has the correct order of downloaded blobs, and we need to tell native to join them
		// check if output already exists and return cached?

		const decryptedFileUri = await this.fileApp.joinFiles(fileName, decryptedChunkFileUris)
		const size = await this.fileApp.getSize(decryptedFileUri)
		for (const tmpBlobFile of decryptedChunkFileUris) {
			await this.fileApp.deleteFile(tmpBlobFile)
		}
		return {
			_type: "FileReference",
			name: fileName,
			mimeType,
			size,
			location: decryptedFileUri,
		}
	}

	/**
	 * Requests a token to upload blobs for the given ArchiveDataType and ownerGroup.
	 * @param archiveDataType
	 * @param ownerGroupId
	 */
	async requestWriteToken(archiveDataType: ArchiveDataType, ownerGroupId: Id): Promise<StorageServerAccessInfo> {
		const tokenRequest = createBlobAccessTokenData({
			archiveDataType,
			write: createBlobWriteData({
				archiveOwnerGroup: ownerGroupId,
			}),
		})
		const {storageAccessInfo} = await this.service.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest, BlobAccessTokenReturnTypeRef)
		return storageAccessInfo
	}

	/**
	 * Requests a token to download blobs.
	 * @param archiveDataType
	 * @param blobs all blobs need to be in one archive.
	 * @param referencingInstance the instance that references the blobs
	 */
	async requestReadToken(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance): Promise<StorageServerAccessInfo> {
		const archiveId = this.getArchiveId(blobs)
		const instance = downcast(referencingInstance)
		let instanceListId: Id | null
		let instanceId: Id
		if (isElementEntity(instance)) {
			instanceListId = null
			instanceId = getEtId(instance)
		} else {
			instanceListId = getListId(instance)
			instanceId = getElementId(instance)
		}
		const instanceIds = [createInstanceId({instanceId})]
		const tokenRequest = createBlobAccessTokenData({
			archiveDataType,
			read: createBlobReadData({
				archiveId,
				instanceListId,
				instanceIds,
			}),
		})
		const {storageAccessInfo} = await this.service.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest, BlobAccessTokenReturnTypeRef)
		return storageAccessInfo
	}

	private async encryptAndUploadChunk(chunk: Uint8Array, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key) {
		const {blobAccessToken, servers} = blobAccessInfo
		const encryptedData = encryptBytes(sessionKey, chunk)
		const blobHash = uint8ArrayToBase64(sha256Hash(encryptedData).slice(0, 6))
		const headers = this.createHeaders(blobAccessToken)
		let error = null
		for (const server of servers) {
			try {
				const response = await this.restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.PUT,
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

	private async encryptAndUploadNativeChunk(fileUri: FileUri, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<string> {
		const {blobAccessToken, servers} = blobAccessInfo
		const encryptedFileInfo = await this.aesApp.aesEncryptFile(sessionKey, fileUri, random.generateRandomData(16))
		const encryptedChunkUri = encryptedFileInfo.uri
		const blobHash = await this.fileApp.hashFile(encryptedChunkUri)

		const headers = this.createHeaders(blobAccessToken)
		let error = null
		for (const server of servers) {
			try {
				const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, server.url)
				const fullUrl = addParamsToUrl(serviceUrl, {blobHash})
				return await this.uploadNative(encryptedChunkUri, fullUrl, headers);
			} catch (e) {
				error = e
				console.log(`can't upload to server from native ${server.url}`, e)
			}
		}
		throw error
	}

	private async uploadNative(location: string, fullUrl: URL, headers: Dict): Promise<string> {
		if (this.suspensionHandler.isSuspended()) {
			return this.suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrl, headers))
		}
		const {
			suspensionTime,
			responseBody,
			statusCode,
			errorId,
			precondition
		} = await this.fileApp.upload(location, fullUrl.toString(), headers) // blobReferenceToken in the response body

		if (statusCode === 200 && responseBody != null) {
			return this.parseBlobPutOutResponse(decodeBase64("utf-8", responseBody))
		} else if (responseBody == null) {
			throw new Error("no response body")
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this.suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this.suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrl, headers))
		} else {
			throw handleRestError(statusCode, ` | PUT ${fullUrl.toString()} failed to natively upload blob`, errorId, precondition)
		}
	}

	private async parseBlobPutOutResponse(data: string): Promise<ReferenceToken> {
		const responseTypeModel = await resolveTypeReference(BlobPutOutTypeRef)
		const instance = JSON.parse(data)
		const response = await this.instanceMapper.decryptAndMapToInstance<BlobPutOut>(responseTypeModel, instance, null)
		return response.blobReferenceToken
	}

	private async downloadAndDecryptChunk(blob: Blob, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<Uint8Array> {
		const {blobAccessToken, servers} = blobAccessInfo
		const {archiveId, blobId} = blob
		const headers = this.createHeaders(blobAccessToken)
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const literalGetData = await this.instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
		const body = JSON.stringify(literalGetData)

		let error = null
		for (const server of servers) {
			try {
				const data = await this.restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.GET, {
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

	private createHeaders(blobAccessToken: string) {
		return Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this.login.createAuthHeaders(),
		)
	}

	private async downloadAndDecryptChunkNative(blob: Blob, blobAccessInfo: StorageServerAccessInfo, sessionKey: Aes128Key): Promise<string> {
		const {blobAccessToken, servers} = blobAccessInfo
		const {archiveId, blobId} = blob
		const headers = this.createHeaders(blobAccessToken)
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const literalGetData = await this.instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
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
		if (this.suspensionHandler.isSuspended()) {
			return this.suspensionHandler.deferRequest(() => this.downloadNative(server, body, headers, sessionKey, fileName))
		}

		const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, server.url)
		const url = addParamsToUrl(serviceUrl, {"_body": body})
		const {statusCode, encryptedFileUri, suspensionTime, errorId, precondition} = await this.fileApp.download(url.toString(), fileName, headers)
		if (statusCode == 200 && encryptedFileUri != null) {
			const decryptedFileUrl = await this.aesApp.aesDecryptFile(sessionKey, encryptedFileUri)
			if (encryptedFileUri != null) {
				try {
					await this.fileApp.deleteFile(encryptedFileUri)
				} catch {
					console.log("Failed to delete encrypted file", encryptedFileUri)
				}
			}
			return decryptedFileUrl
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this.suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this.suspensionHandler.deferRequest(() => this.downloadNative(server, body, headers, sessionKey, fileName))
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
}