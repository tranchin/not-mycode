# Makefile for building argon2.wasm (NOTE: this is not for building the package itself - use npm for this!)

# If you run out of memory (ARGON2_MEMORY_ALLOCATION_ERROR) and it's not being caused by a memory leak, try increasing this.
TOTAL_MEMORY=32MB

CC=emcc
WASM=lib/wasm/argon2.wasm

all: ${WASM}
clean:
	rm -rf ${WASM}
phc-winner-argon2:
	git clone https://github.com/tutao/phc-winner-argon2 phc-winner-argon2
${WASM}: phc-winner-argon2
	git -C phc-winner-argon2 pull
	${CC} \
    	phc-winner-argon2/src/argon2.c \
    	phc-winner-argon2/src/core.c \
    	phc-winner-argon2/src/ref.c \
    	phc-winner-argon2/src/blake2/blake2b.c \
    	-I phc-winner-argon2/include \
    	-DARGON2_NO_THREADS \
    	-flto \
    	-Oz \
    	--no-entry \
    	-s TOTAL_MEMORY=${TOTAL_MEMORY} \
    	-s EXPORTED_FUNCTIONS="['_argon2id_hash_raw', '_malloc', '_free']" \
    	-o ${WASM}

# -DARGON2_NO_THREADS sets the "ARGON2_NO_THREADS" constant which disables threads
# -flto enables link-time-optimization, providing a slight performance and size improvement
# -Oz optimizes for size and performance, with size as a higher priority
# --no-entry creates a WebAssembly module without a main function
# -s TOTAL_MEMORY=$TOTAL_MEMORY allocates memory for the VM
# -s EXPORTED_FUNCTIONS exports C functions (note that C functions are emitted with a _ prefix; this is just how C works)
# -I adds an include directory - needed for argon2 to compile

# Another argument that might be worth considering is -mbulk-memory
#
# -mbulk-memory enables native WebAssembly bulk memory operations and slightly reduces the size of the binary even
# further, but it is not supported on all WebAssembly implementations
#
# - This was added to Chromium 75 in 2019
# - This was added to Firefox 79 in 2020
# - This was added to Safari 15 (macOS 10.15 Catalina or newer) in 2021
#
# Without it, memcpy() seems to break with an 'unreachable' error on large copies, except if -Oz is passed for some
# undocumented reason
