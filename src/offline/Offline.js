// @flow

import {isNative} from "../api/common/Env"
import type {NativeInterface} from "../native/common/NativeInterface"
import type {LoginController} from "../api/main/LoginController"

export class OfflineModeHandler {

	native: NativeInterface
	logins: LoginController
	enabled: boolean

	constructor(native: NativeInterface, logins: LoginController) {
		this.native = native
		this.logins = logins
	}

	async getOfflineStatusForUser(): Promise<OfflineStatus> {
		if (!isNative()) {
			return OfflineStatus.PERMANENTLY_DISABLED
		}

		if (!this.shouldAskAboutOffline) {
			return OfflineStatus.PERMANENTLY_DISABLED
		}

		// TODO Implement natively
		return await this.native.invokeNative("getOfflineModeStatus")
	}

	async switchToOfflineMode(): Promise<void> {

	}

	async enableOfflineMode(): Promise<void> {
		// TODO

		// Tell native to setup offline mode
	}

	async permanentlyDisableOfflineModeForUser(): Promise<void> {

	}
}


