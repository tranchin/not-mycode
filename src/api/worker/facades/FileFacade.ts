import {_TypeModel as FileDataDataGetTypModel, createFileDataDataGet} from "../../entities/tutanota/FileDataDataGet"
import {addParamsToUrl, isSuspensionResponse, RestClient} from "../rest/RestClient"
import {encryptBytes, resolveSessionKey} from "../crypto/CryptoFacade"
import type {File as TutanotaFile} from "../../entities/tutanota/File"
import {_TypeModel as FileTypeModel} from "../../entities/tutanota/File"
import {assert, filterInt, neverNull, TypeRef, uint8ArrayToBase64} from "@tutao/tutanota-utils"
import {LoginFacadeImpl} from "./LoginFacade"
import {createFileDataDataPost} from "../../entities/tutanota/FileDataDataPost"
import {_service} from "../rest/ServiceRestClient"
import {FileDataReturnPostTypeRef} from "../../entities/tutanota/FileDataReturnPost"
import {ArchiveDataType, GroupType} from "../../common/TutanotaConstants"
import {_TypeModel as FileDataDataReturnTypeModel} from "../../entities/tutanota/FileDataDataReturn"
import {_TypeModel as BlobGetInTypeModel} from "../../entities/storage/BlobGetIn"

import {HttpMethod, MediaType, resolveTypeReference} from "../../common/EntityFunctions"
import {assertWorkerOrNode, getHttpOrigin, Mode} from "../../common/Env"
import {handleRestError} from "../../common/error/RestError"
import {convertToDataFile, DataFile} from "../../common/DataFile"
import type {SuspensionHandler} from "../SuspensionHandler"
import {StorageService} from "../../entities/storage/Services"
import {serviceRequest} from "../ServiceRequestWorker"
import {createBlobAccessTokenData} from "../../entities/storage/BlobAccessTokenData"
import {BlobAccessTokenReturnTypeRef} from "../../entities/storage/BlobAccessTokenReturn"
import {createBlobWriteData} from "../../entities/storage/BlobWriteData"
import {aes128Decrypt, random, sha256Hash, uint8ArrayToKey} from "@tutao/tutanota-crypto"
import type {NativeFileApp} from "../../../native/common/FileApp"
import type {AesApp} from "../../../native/worker/AesApp"
import {InstanceMapper} from "../crypto/InstanceMapper"
import {FileReference} from "../../common/utils/FileUtils";
import {TutanotaService} from "../../entities/tutanota/Services";
import {StorageServerAccessInfo} from "../../entities/storage/StorageServerAccessInfo.js"
import {createBlobGetIn} from "../../entities/storage/BlobGetIn.js"
import {locator} from "../WorkerLocator"
import {BlobPutOut, BlobPutOutTypeRef} from "../../entities/storage/BlobPutOut"
import {createBlobReadData} from "../../entities/storage/BlobReadData"

assertWorkerOrNode()
const REST_PATH = "/rest/tutanota/filedataservice"
const STORAGE_REST_PATH = `/rest/storage/${StorageService.BlobService}`

export class FileFacade {
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

	clearFileData(): Promise<void> {
		return this._fileApp.clearFileData()
	}

	downloadFileContent(file: TutanotaFile): Promise<DataFile> {
		let requestData = createFileDataDataGet()
		requestData.file = file._id
		requestData.base64 = false
		return resolveSessionKey(FileTypeModel, file).then(sessionKey => {
			return this._instanceMapper.encryptAndMapToLiteral(FileDataDataGetTypModel, requestData, null).then(entityToSend => {
				let headers = this._login.createAuthHeaders()

				headers["v"] = FileDataDataGetTypModel.version
				let body = JSON.stringify(entityToSend)
				return this._restClient.request(REST_PATH, HttpMethod.GET, {body, responseType: MediaType.Binary, headers}).then(data => {
					return convertToDataFile(file, aes128Decrypt(neverNull(sessionKey), data))
				})
			})
		})
	}

	async downloadFileContentNative(file: TutanotaFile): Promise<FileReference> {
		assert(env.mode === Mode.App || env.mode === Mode.Desktop, "Environment is not app or Desktop!")

		if (this._suspensionHandler.isSuspended()) {
			return this._suspensionHandler.deferRequest(() => this.downloadFileContentNative(file))
		}

		const requestData = createFileDataDataGet({
			file: file._id,
			base64: false,
		})
		const sessionKey = await resolveSessionKey(FileTypeModel, file)
		const entityToSend = await this._instanceMapper.encryptAndMapToLiteral(FileDataDataGetTypModel, requestData, null)

		const headers = this._login.createAuthHeaders()

		headers["v"] = FileDataDataGetTypModel.version
		const body = JSON.stringify(entityToSend)
		const queryParams = {
			_body: body,
		}
		const url = addParamsToUrl(new URL(getHttpOrigin() + REST_PATH), queryParams)
		const {
			statusCode,
			encryptedFileUri,
			errorId,
			precondition,
			suspensionTime
		} = await this._fileApp.download(url.toString(), file.name, headers)

		if (suspensionTime && isSuspensionResponse(statusCode, suspensionTime)) {
			this._suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))

			return this._suspensionHandler.deferRequest(() => this.downloadFileContentNative(file))
		} else if (statusCode === 200 && encryptedFileUri != null) {
			const decryptedFileUri = await this._aesApp.aesDecryptFile(neverNull(sessionKey), encryptedFileUri)

			try {
				await this._fileApp.deleteFile(encryptedFileUri)
			} catch (e) {
				console.warn("Failed to delete encrypted file", encryptedFileUri)
			}

			return {
				_type: "FileReference",
				name: file.name,
				mimeType: file.mimeType ?? MediaType.Binary,
				location: decryptedFileUri,
				size: filterInt(file.size),
			}
		} else {
			throw handleRestError(statusCode, ` | GET ${url.toString()} failed to natively download attachment`, errorId, precondition)
		}
	}

	uploadFileData(dataFile: DataFile, sessionKey: Aes128Key): Promise<Id> {
		let encryptedData = encryptBytes(sessionKey, dataFile.data)
		let fileData = createFileDataDataPost()
		fileData.size = dataFile.data.byteLength.toString()
		fileData.group = this._login.getGroupId(GroupType.Mail) // currently only used for attachments

		return _service(TutanotaService.FileDataService, HttpMethod.POST, fileData, FileDataReturnPostTypeRef, undefined, sessionKey).then(fileDataPostReturn => {
			// upload the file content
			let fileDataId = fileDataPostReturn.fileData

			let headers = this._login.createAuthHeaders()

			headers["v"] = FileDataDataReturnTypeModel.version
			return this._restClient
					   .request(
						   REST_PATH,
						   HttpMethod.PUT,
						   {
							   queryParams: {
								   fileDataId: fileDataId,
							   },
							   headers,
							   body: encryptedData,
							   responseType: MediaType.Binary,
						   },
					   )
					   .then(() => fileDataId)
		})
	}

	/**
	 * Does not cleanup uploaded files. This is a responsibility of the caller
	 */
	async uploadFileDataNative(fileReference: FileReference, sessionKey: Aes128Key): Promise<Id> {
		if (this._suspensionHandler.isSuspended()) {
			return this._suspensionHandler.deferRequest(() => this.uploadFileDataNative(fileReference, sessionKey))
		}

		const encryptedFileInfo = await this._aesApp.aesEncryptFile(sessionKey, fileReference.location, random.generateRandomData(16))
		const fileData = createFileDataDataPost({
			size: encryptedFileInfo.unencSize.toString(),
			group: this._login.getGroupId(GroupType.Mail), // currently only used for attachments
		})
		const fileDataPostReturn = await _service(TutanotaService.FileDataService, HttpMethod.POST, fileData, FileDataReturnPostTypeRef, undefined, sessionKey)
		const fileDataId = fileDataPostReturn.fileData

		const headers = this._login.createAuthHeaders()

		headers["v"] = FileDataDataReturnTypeModel.version
		const url = addParamsToUrl(new URL(getHttpOrigin() + "/rest/tutanota/filedataservice"), {
			fileDataId,
		})
		const {
			statusCode,
			errorId,
			precondition,
			suspensionTime
		} = await this._fileApp.upload(encryptedFileInfo.uri, url.toString(), headers)

		if (statusCode === 200) {
			return fileDataId
		} else if (suspensionTime && isSuspensionResponse(statusCode, suspensionTime)) {
			this._suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))

			return this._suspensionHandler.deferRequest(() => this.uploadFileDataNative(fileReference, sessionKey))
		} else {
			throw handleRestError(statusCode, ` | PUT ${url.toString()} failed to natively upload attachment`, errorId, precondition)
		}
	}

	/**
	 * @returns blobReferenceToken
	 */
	async uploadBlob(
		instance: {
			_type: TypeRef<any>
		},
		archiveDataType: ArchiveDataType,
		blobData: Uint8Array,
		ownerGroupId: Id
	): Promise<BlobPutOut> {
		const typeModel = await resolveTypeReference(instance._type)
		const sessionKey = neverNull(await resolveSessionKey(typeModel, instance))
		const encryptedData = encryptBytes(sessionKey, blobData)
		const blobHash = uint8ArrayToBase64(sha256Hash(encryptedData).slice(0, 6))
		const {blobAccessToken, servers} = await this.getUploadToken(archiveDataType, ownerGroupId)
		const headers = Object.assign(
			{
				blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this._login.createAuthHeaders(),
		)
		return this._restClient.request(
			STORAGE_REST_PATH,
			HttpMethod.PUT,
			{
				queryParams: {
					blobHash
				},
				headers,
				body: encryptedData,
				responseType: MediaType.Json,
				baseUrl: servers[0].url,
			},
		).then(data => {
			return resolveTypeReference(BlobPutOutTypeRef).then(responseTypeModel => {
				let instance = JSON.parse(data)
				return locator.instanceMapper.decryptAndMapToInstance(responseTypeModel, instance, null)
			})

		})
	}

	async downloadBlob(archiveDataType: ArchiveDataType, archiveId: Id, blobId: Id, key: Uint8Array): Promise<Uint8Array> {
		const {blobAccessToken, servers} = await this.getDownloadTokenOwnArchive(archiveDataType, archiveId)
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
		const data = await this._restClient.request(STORAGE_REST_PATH, HttpMethod.GET, {
			headers,
			body,
			responseType: MediaType.Binary,
			baseUrl: servers[0].url,
		})
		return aes128Decrypt(uint8ArrayToKey(key), data)
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
}