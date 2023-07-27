#!/bin/bash

# Shell script to build the argon2 WebAssembly

OUTPUT_DIR=lib/wasm
ARGON2_DIR=phc-winner-argon2

# Print and then execute, exiting if a non-zero status code is returned
function e() {
	echo "$ $@"
	"${@}"
	if [[ $? != 0 ]]; then
		ERROR_CODE=$?
		echo "Failed to build argon2 WebAssembly. Command failed with error code $ERROR_CODE"
		exit $ERROR_CODE
	fi
}

if [[ "$#" != "0" ]]; then
	if [[ "$1" == "help" || "$1" == "--help" || "$1" == "-h" ]]; then
		echo "Usage: $0 [clean | help]"
		exit
	elif [[ "$1" == "clean" ]]; then
		e rm -rf "${OUTPUT_DIR}" "${ARGON2_DIR}"
		exit
	else
		echo "Unknown argument $1" 1>&2
		"${0}" help
		exit
	fi
fi

if [[ ! -d "${ARGON2_DIR}" ]]; then
	e git clone https://github.com/tutao/phc-winner-argon2 "${ARGON2_DIR}"
else
	e git -C "${ARGON2_DIR}" pull
fi

if [[ ! -d "${OUTPUT_DIR}" ]]; then
	e mkdir "${OUTPUT_DIR}"
fi

# If you run out of memory (ARGON2_MEMORY_ALLOCATION_ERROR) and it's not being caused by a memory leak, try increasing this.
TOTAL_MEMORY=32MB
e emcc \
	"${ARGON2_DIR}/src/argon2.c" \
	"${ARGON2_DIR}/src/core.c" \
	"${ARGON2_DIR}/src/ref.c" \
	"${ARGON2_DIR}/src/blake2/blake2b.c" \
	-I "${ARGON2_DIR}/include" \
	-DARGON2_NO_THREADS \
	-flto \
	-Oz \
	--no-entry \
	-s TOTAL_MEMORY=$TOTAL_MEMORY \
	-s EXPORTED_FUNCTIONS="['_argon2id_hash_raw', '_malloc', '_free']" \
	-o "${OUTPUT_DIR}/argon2.wasm"

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