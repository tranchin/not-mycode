declare module "@tutao/tutanota-argon2id"

async function argon2idHashRaw(
	timeCost: number,
	memoryCost: number,
	parallelism: number,
	password: Uint8Array,
	salt: Uint8Array,
	hashLength: number,
): Promise<Uint8Array>

async function loadArgon2Module()

async function setArgon2Module(module: WebAssembly.Exports)

export { argon2idHashRaw, loadArgon2Module }
