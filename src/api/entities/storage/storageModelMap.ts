const map = {
    BlobGetIn: () => import('./BlobGetIn.js'),
    BlobWriteData: () => import('./BlobWriteData.js'),
    BlobAccessTokenData: () => import('./BlobAccessTokenData.js'),
    BlobAccessTokenReturn: () => import('./BlobAccessTokenReturn.js'),
    BlobReferenceDataPut: () => import('./BlobReferenceDataPut.js'),
    BlobReferenceDataDelete: () => import('./BlobReferenceDataDelete.js'),
    BlobPutOut: () => import('./BlobPutOut.js'),
    BlobArchiveRef: () => import('./BlobArchiveRef.js'),
    BlobId: () => import('./BlobId.js'),
    StorageServerUrl: () => import('./StorageServerUrl.js'),
    StorageServerAccessInfo: () => import('./StorageServerAccessInfo.js'),
    InstanceId: () => import('./InstanceId.js'),
    BlobReadData: () => import('./BlobReadData.js')
}
export default map