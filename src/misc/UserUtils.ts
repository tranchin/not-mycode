import { EntityClient } from "../api/common/EntityClient.js"
import { User } from "../api/entities/sys/TypeRefs.js"
import { createUserSettingsGroupRoot, UserSettingsGroupRoot, UserSettingsGroupRootTypeRef } from "../api/entities/tutanota/TypeRefs.js"
import { ofClass } from "@tutao/tutanota-utils"
import { NotFoundError } from "../api/common/error/RestError.js"

export function loadUserSettingsGroupRoot(entityClient: EntityClient, user: User): Promise<UserSettingsGroupRoot> {
	return entityClient
		.load(UserSettingsGroupRootTypeRef, user.userGroup.group)
		.catch(
			ofClass(NotFoundError, () =>
				entityClient
					.setup(null, createUserSettingsGroupRoot({ _ownerGroup: user.userGroup.group }))
					.then(() => entityClient.load(UserSettingsGroupRootTypeRef, user.userGroup.group)),
			),
		)
}
