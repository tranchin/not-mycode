let argon2Module = undefined

export async function loadArgon2Module() {
	if (!argon2Module) {
		if (typeof process !== "undefined") {
			try {
				const { join, dirname } = await import("node:path")
				const { readFile } = await import("node:fs/promises")
				const { fileURLToPath } = await import("node:url")

				const wasmPath = join(dirname(fileURLToPath(import.meta.url)), "wasm", "argon2.wasm")
				const wasmBuffer = await readFile(wasmPath)
				argon2Module = await WebAssembly.instantiate(wasmBuffer)
			} catch {
				throw new Error("Trying to import as node which is not available")
			}
		} else {
			argon2Module = await WebAssembly.instantiateStreaming(await fetch("wasm/argon2.wasm"))
		}
	}
	return argon2Module.instance.exports
}
