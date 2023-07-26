declare module "@tutao/tutanota-argon2id"

async function argon2idHashRaw(
	timeCost: number,
	memoryCost: number,
	parallelism: number,
	password: Uint8Array,
	salt: Uint8Array,
	hashLength: number,
): Promise<Uint8Array>

export { argon2idHashRaw }
