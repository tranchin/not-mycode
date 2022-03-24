import o from "ospec"
import {BLOB_SERVICE_REST_PATH, BlobFacade} from "../../../../src/api/worker/facades/BlobFacade.js"
import {LoginFacadeImpl} from "../../../../src/api/worker/facades/LoginFacade"
import {RestClient} from "../../../../src/api/worker/rest/RestClient"
import {SuspensionHandler} from "../../../../src/api/worker/SuspensionHandler"
import {NativeFileApp} from "../../../../src/native/common/FileApp"
import {AesApp} from "../../../../src/native/worker/AesApp"
import {InstanceMapper} from "../../../../src/api/worker/crypto/InstanceMapper"
import {ArchiveDataType, MAX_BLOB_SIZE_BYTES} from "../../../../src/api/common/TutanotaConstants"
import {createBlob} from "../../../../src/api/entities/sys/Blob"
import {createFile} from "../../../../src/api/entities/tutanota/File.js"
import {ServiceRestInterface} from "../../../../src/api/worker/rest/ServiceRestInterface"
import {instance, matchers, object, verify, when} from "testdouble"
import {HttpMethod} from "../../../../src/api/common/EntityFunctions"
import {StorageService} from "../../../../src/api/entities/storage/Services"
import {BlobAccessTokenReturnTypeRef, createBlobAccessTokenReturn} from "../../../../src/api/entities/storage/BlobAccessTokenReturn"
import {createStorageServerAccessInfo} from "../../../../src/api/entities/storage/StorageServerAccessInfo"
import {createBlobAccessTokenData} from "../../../../src/api/entities/storage/BlobAccessTokenData"
import {createBlobReadData} from "../../../../src/api/entities/storage/BlobReadData"
import {createInstanceId} from "../../../../src/api/entities/storage/InstanceId"
import {getElementId, getEtId, getListId} from "../../../../src/api/common/utils/EntityUtils"
import {createMailBody} from "../../../../src/api/entities/tutanota/MailBody"
import {createBlobWriteData} from "../../../../src/api/entities/storage/BlobWriteData"
import {aes128Decrypt, aes128RandomKey, sha256Hash} from "@tutao/tutanota-crypto"
import {createBlobPutOut} from "../../../../src/api/entities/storage/BlobPutOut"
import {createStorageServerUrl} from "../../../../src/api/entities/storage/StorageServerUrl"
import {arrayEquals, uint8ArrayToBase64} from "@tutao/tutanota-utils"
import {Mode} from "../../../../src/api/common/Env"

const {anything, captor} = matchers

o.spec("BlobFacade test", function () {
	let facade: BlobFacade
	let loginMock: LoginFacadeImpl
	let serviceMock: ServiceRestInterface
	let restClientMock: RestClient
	let suspensionHandlerMock: SuspensionHandler
	let fileAppMock: NativeFileApp
	let aesAppMock: AesApp
	let instanceMapperMock: InstanceMapper
	const archiveId = "archiveId1"
	const blobs = [createBlob({archiveId}), createBlob({archiveId}), createBlob({archiveId})]
	let archiveDataType = ArchiveDataType.Attachments


	o.beforeEach(function () {
		loginMock = instance(LoginFacadeImpl)
		serviceMock = object<ServiceRestInterface>()
		restClientMock = instance(RestClient)
		suspensionHandlerMock = instance(SuspensionHandler)
		fileAppMock = instance(NativeFileApp)
		aesAppMock = instance(AesApp)
		instanceMapperMock = instance(InstanceMapper)

		facade = new BlobFacade(loginMock, serviceMock, restClientMock, suspensionHandlerMock, fileAppMock, aesAppMock, instanceMapperMock)
	})

	o.afterEach(function () {
		env.mode = Mode.Browser
	})

	o.spec("request access tokens", function () {
		o("read token LET", async function () {
			const file = createFile({blobs, _id: ["listId", "elementId"]})
			const expectedToken = createBlobAccessTokenReturn({storageAccessInfo: createStorageServerAccessInfo({blobAccessToken: "123"})})
			when(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, anything(), BlobAccessTokenReturnTypeRef))
				.thenResolve(expectedToken)

			const readToken = await facade.requestReadToken(archiveDataType, blobs, file)

			const tokenRequest = captor()
			verify(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest.capture(), BlobAccessTokenReturnTypeRef))
			let instanceId = createInstanceId({instanceId: getElementId(file)})
			o(tokenRequest.value).deepEquals(createBlobAccessTokenData({
				archiveDataType,
				read: createBlobReadData({
					archiveId,
					instanceListId: getListId(file),
					instanceIds: [instanceId],
				})
			}))
			o(readToken).equals(expectedToken.storageAccessInfo)
		})

		o("read token ET", async function () {
			const mailBody = createMailBody({_id: "elementId"})
			const expectedToken = createBlobAccessTokenReturn({storageAccessInfo: createStorageServerAccessInfo({blobAccessToken: "123"})})
			when(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, anything(), BlobAccessTokenReturnTypeRef))
				.thenResolve(expectedToken)

			const readToken = await facade.requestReadToken(archiveDataType, blobs, mailBody)

			const tokenRequest = captor()
			verify(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest.capture(), BlobAccessTokenReturnTypeRef))
			let instanceId = createInstanceId({instanceId: getEtId(mailBody)})
			o(tokenRequest.value).deepEquals(createBlobAccessTokenData({
				archiveDataType,
				read: createBlobReadData({
					archiveId,
					instanceListId: null,
					instanceIds: [instanceId],
				})
			}))
			o(readToken).equals(expectedToken.storageAccessInfo)
		})

		o("write token", async function () {
			const ownerGroup = "ownerId"
			const expectedToken = createBlobAccessTokenReturn({storageAccessInfo: createStorageServerAccessInfo({blobAccessToken: "123"})})
			when(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, anything(), BlobAccessTokenReturnTypeRef))
				.thenResolve(expectedToken)

			const writeToken = await facade.requestWriteToken(archiveDataType, ownerGroup)

			const tokenRequest = captor()
			verify(serviceMock.serviceRequest(StorageService.BlobAccessTokenService, HttpMethod.POST, tokenRequest.capture(), BlobAccessTokenReturnTypeRef))
			o(tokenRequest.value).deepEquals(createBlobAccessTokenData({
				archiveDataType,
				write: createBlobWriteData({
					archiveOwnerGroup: ownerGroup,
				})
			}))
			o(writeToken).equals(expectedToken.storageAccessInfo)
		})

	})

	o.spec("upload", function () {
		o("encryptAndUpload single blob", async function () {
			const ownerGroup = "ownerId"
			const sessionKey = aes128RandomKey()
			const blobData = new Uint8Array([1, 2, 3])

			const expectedReferenceTokens = ["blobRefToken"]

			let storageAccessInfo = createStorageServerAccessInfo({blobAccessToken: "123", servers: [createStorageServerUrl({url: "w1"})]})
			facade.requestWriteToken = () => Promise.resolve(storageAccessInfo)
			let blobServiceResponse = createBlobPutOut({blobReferenceToken: expectedReferenceTokens[0]})
			when(instanceMapperMock.decryptAndMapToInstance(anything(), anything(), anything())).thenResolve(blobServiceResponse)
			when(restClientMock.request(BLOB_SERVICE_REST_PATH, HttpMethod.PUT, anything())).thenResolve(JSON.stringify(blobServiceResponse))

			const referenceTokens = await facade.encryptAndUpload(archiveDataType, blobData, ownerGroup, sessionKey)
			o(referenceTokens).deepEquals(expectedReferenceTokens)

			const optionsCaptor = captor()
			verify(restClientMock.request(BLOB_SERVICE_REST_PATH, HttpMethod.PUT,
				optionsCaptor.capture()))
			const encryptedData = optionsCaptor.value.body
			const decryptedData = aes128Decrypt(sessionKey, encryptedData)
			o(arrayEquals(decryptedData, blobData)).equals(true)
			o(optionsCaptor.value.baseUrl).equals("w1")
			o(optionsCaptor.value.headers.blobAccessToken).deepEquals(storageAccessInfo.blobAccessToken)
			const expectedBlobHash = uint8ArrayToBase64(sha256Hash(encryptedData).slice(0, 6))
			o(optionsCaptor.value.queryParams.blobHash).equals(expectedBlobHash)
		})

		o.only("encryptAndUploadNative", async function () {
			const ownerGroup = "ownerId"
			const sessionKey = aes128RandomKey()
			const blobData = new Uint8Array([1, 2, 3])

			const expectedReferenceTokens = ["blobRefToken"]
			const uploadedFileUri = "rawFileUri"
			const chunkUris = ["uri1"]

			let storageAccessInfo = createStorageServerAccessInfo({blobAccessToken: "123", servers: [createStorageServerUrl({url: "http://w1.api.tutanota.com"})]})
			facade.requestWriteToken = () => Promise.resolve(storageAccessInfo)
			let blobServiceResponse = createBlobPutOut({blobReferenceToken: expectedReferenceTokens[0]})

			when(instanceMapperMock.decryptAndMapToInstance(anything(), anything(), anything())).thenResolve(blobServiceResponse)
			when(fileAppMock.splitFile(uploadedFileUri, MAX_BLOB_SIZE_BYTES)).thenResolve(chunkUris)
			let encryptedFileInfo = {
				uri: 'encryptedChunkUri',
				unencSize: 3
			}
			when(aesAppMock.aesEncryptFile(sessionKey, chunkUris[0], anything())).thenResolve(encryptedFileInfo)
			const blobHash = "blobHash"
			when(fileAppMock.hashFile(encryptedFileInfo.uri)).thenResolve(blobHash)
			when(fileAppMock.upload(anything(), anything(), anything())).thenResolve({statusCode: 200, responseBody: JSON.stringify(blobServiceResponse)})

			env.mode = Mode.Desktop
			const referenceTokens = await facade.encryptAndUploadNative(archiveDataType, uploadedFileUri, ownerGroup, sessionKey)
			o(referenceTokens).deepEquals(expectedReferenceTokens)

			const headersCaptor = captor()
			verify(fileAppMock.upload(encryptedFileInfo.uri, `http://w1.api.tutanota.com${BLOB_SERVICE_REST_PATH}?blobHash=${blobHash}`, headersCaptor.capture()))
			o(headersCaptor.value.blobAccessToken).deepEquals(storageAccessInfo.blobAccessToken)
		})

	})

	o.spec("download", function () {
		o("downloadAndDecrypt", async function () {

		})

		o("downloadAndDecryptNative", async function () {

		})

	})
})