import { default as keytar } from "keytar"
import { CancelledError } from "../../api/common/error/CancelledError"
import { noOp } from "@tutao/tutanota-utils"
import * as PathModule from "node:path"
import * as FsModule from "node:fs"
import { DeviceStorageUnavailableError } from "../../api/common/error/DeviceStorageUnavailableError.js"

const { CANCELLED, getPassword, setPassword } = keytar

export interface SecretStorage {
	getPassword(service: string, account: string): Promise<string | null>

	setPassword(service: string, account: string, password: string): Promise<void>
}

export class KeytarSecretStorage implements SecretStorage {
	/**
	 * keytar can't handle concurrent accesses to the keychain, so we need to sequence
	 * calls to getPassword and setPassword.
	 * this promise chain stores pending operations.
	 */
	private lastOp: Promise<unknown> = Promise.resolve()

	getPassword(service: string, account: string): Promise<string | null> {
		const newOp = this.lastOp.catch(noOp).then(() =>
			getPassword(service, account).catch((e) => {
				if (e.message === CANCELLED) {
					throw new CancelledError("user cancelled keychain unlock")
				}
				throw e
			}),
		)
		this.lastOp = newOp

		return newOp
	}

	setPassword(service: string, account: string, password: string): Promise<void> {
		const newOp = this.lastOp.catch(noOp).then(() => setPassword(service, account, password))
		this.lastOp = newOp
		return newOp
	}
}

/**
 * Secret Storage impl using the electron 15+ SafeStorage API
 *
 * Note: the main thread will be blocked while the keychain is being unlocked,
 * potentially for as long as the user takes to enter a password.
 * We're asking for access before any windows are created, which should prevent
 * any weirdness arising from that.
 */
export class SafeStorageSecretStorage implements SecretStorage {
	constructor(
		private readonly electron: typeof Electron.CrossProcessExports,
		private readonly fs: typeof FsModule,
		private readonly path: typeof PathModule,
		private readonly keytarSecretStorage: KeytarSecretStorage,
	) {}

	async getPassword(service: string, account: string): Promise<string | null> {
		await this.assertAvailable()
		await this.migrateKeytarPassword(service, account)
		const keyPath = this.getKeyPath(service, account)
		try {
			const encPwBuffer = await this.fs.promises.readFile(keyPath)
			const plainPw = this.electron.safeStorage.decryptString(encPwBuffer)
			return Promise.resolve(plainPw)
		} catch (e) {
			if (e.code === "ENOENT") return null
			throw e
		}
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		await this.assertAvailable()
		const keyPath = this.getKeyPath(service, account)
		const cypherBuffer = this.electron.safeStorage.encryptString(password)
		return this.fs.promises.writeFile(keyPath, cypherBuffer)
	}

	private getKeyPath(service: string, account: string): string {
		const fname = service.concat("-", account)
		const safeStoragePath = this.getSafeStoragePath()
		return this.path.join(safeStoragePath, fname)
	}

	/**
	 * this should always be a path inside the user's home directory (or equivalent)
	 * @private
	 */
	private getSafeStoragePath(): string {
		return this.path.join(this.electron.app.getPath("userData"), "safe_storage")
	}

	/**
	 * ensures that the safe_storage directory exists and that we can use the
	 * safeStorage API
	 * @private
	 */
	private async assertAvailable(): Promise<void> {
		await this.fs.promises.mkdir(this.getSafeStoragePath(), { recursive: true })
		// see https://github.com/electron/electron/issues/32206
		// the rest of the safeStorage API should be throwing errors
		// we can catch until this works.
		if (process.platform === "linux") return
		if (this.electron.safeStorage.isEncryptionAvailable()) return
		throw new DeviceStorageUnavailableError("safeStorage API is not available", null)
	}

	/**
	 * most devices will have stored a deviceKey with keytar, which we can move
	 * to the safeStorage impl.
	 *
	 * @private
	 */
	private async migrateKeytarPassword(service: string, account: string): Promise<void> {
		let keytarPw = null
		try {
			keytarPw = await this.keytarSecretStorage.getPassword(service, account)
		} catch (e) {
			console.debug("keytar failed, assuming there's no pw stored")
		}
		if (keytarPw) {
			await this.setPassword(service, account, keytarPw)
			// do not do this until later. there may be multiple installs using
			// the deviceKey if for some reason keytar used a system keychain
			// to store it.
			// await this._keytarSecretStorage.deletePassword(service, account)
		}
	}
}
