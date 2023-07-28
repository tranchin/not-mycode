let argon2Module = undefined

/**
 * Set the Argon2 WebAssembly module
 */
export async function setArgon2Module(module) {
	argon2Module = module
}

/**
 * Load the Argon2 WebAssembly module
 */
export async function loadArgon2Module() {
	if (!argon2Module) {
		if (typeof process !== "undefined") {
			try {
				const { join, dirname } = await import("node:path")
				const { readFile } = await import("node:fs/promises")
				const { fileURLToPath } = await import("node:url")

				const wasmPath = join(dirname(fileURLToPath(import.meta.url)), "wasm/argon2.wasm")
				const wasmBuffer = await readFile(wasmPath)
				setArgon2Module(await WebAssembly.instantiate(wasmBuffer))
			} catch {
				throw new Error("Trying to import as node which is not available")
			}
		} else {
			setArgon2Module(await WebAssembly.instantiateStreaming(await fetch("wasm/argon2.wasm")))
		}
	}
}

/**
 * Get the Argon2 module and return it
 * @returns {Promise<WebAssembly.Instance>} exports
 */
export async function getArgon2Module() {
	await loadArgon2Module()
	return argon2Module.instance
}
