You need at least NDK 23

```
# install rust for our target
rustup add aarch64-linux-android

# build shared lib for our target
cargo build --lib --target aarch64-linux-android --release --config target.aarch64-linux-android.linker=\"/opt/android-sdk-linux/ndk/26.1.10909125/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android30-clang\"

# generate bindings for our target
cargo run --bin uniffi-bindgen generate --library target/aarch64-linux-android/release/libtutasdk.so --language kotlin --out-dir out

# And then consume one way or another.
# Would be great to expose maven library for Android.
# Ad-hoc:
# move target/aarch64-linux/android/release/libtutasdk.so.so into app-android/app/src/main/jniLib/arm64-v8a
# move generated kotlin code into app/src/main/java
```