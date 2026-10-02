# HRFlow attendance — Dioxus prototype

A **disposable, read-only UI experiment** for one HR attendance summary workflow. Its only user action is selecting a fictional employee and month; summary cards and the daily log update from fixed, in-memory fixtures.

> **Synthetic demo only.** Names, teams, dates, times, attendance statuses, and raw lateness inputs are invented. This prototype is not connected to HRFlow production, Firebase, a network API, authentication, local storage, or real employee data. Do not use it for HR decisions or production deployment.

## Run and build

The root virtual workspace owns the single `Cargo.lock` for this prototype and both domain crates. The application crate is pinned to Dioxus `=0.7.10` and uses a local path dependency on `../../rust/attendance-policy`. The standard Cargo setup is Rust/Cargo and the `wasm32-unknown-unknown` target. Dioxus CLI **0.7.10** is needed only for the web and Android build procedures below. Install the CLI with `cargo install dioxus-cli --version 0.7.10 --locked`, or set `DX` to another verified 0.7.10 binary. For this verification, the official Linux x86_64 release binary was checksum-verified and kept in the ignored local path `target/tooling/dioxus-cli-0.7.10/bin/dx`.

From the workspace root, run the shared checks with:

```bash
cargo fmt --all -- --check
cargo test --workspace --locked
./scripts/verify-rust-workspace.sh
```

The workspace verifier also checks the exact member list and dependency edges, then runs both JavaScript-oracle parity checks. A member-local `cargo test --locked` uses the same root lockfile. See the [Rust workspace guide](../../docs/RUST_WORKSPACE.md) for current boundaries and extension rules.

### Web

```bash
cd /workspace/hrflow-rust-migration/prototypes/dioxus-hrflow
rustup target add wasm32-unknown-unknown
cargo fmt -- --check
cargo test --locked
DX="${DX:-$PWD/target/tooling/dioxus-cli-0.7.10/bin/dx}"
"$DX" serve --platform web
TELEMETRY=false "$DX" build --platform web --release --locked
```

The verified release output, relative to the workspace root, is `target/dx/dioxus-hrflow-prototype/release/web/public`. Cargo workspace builds place Dioxus output in the root target directory. Dioxus emits a hashed local Inter font file under its `assets/` directory. The final screenshot is [`preview.png`](./preview.png), a full-page 1440 × 1370 px desktop capture of the release build.

### Android package build (local, unsigned)

Dioxus CLI 0.7.10 `dx build --help` provides `--target <TARGET>` as a Rust target triple, not an Android-specific ABI flag. The official [Dioxus 0.7 mobile guide](https://dioxuslabs.com/learn/0.7/guides/platforms/mobile) lists the Android Rust targets but does not configure Gradle ABI filters. Passing `--target aarch64-linux-android` built the ARM64 native library while retaining the already staged x86_64 library. The standard Gradle [`ndk.abiFilters`](https://developer.android.com/studio/projects/gradle-external-native-builds) setting then constrained the APK to exactly `arm64-v8a` and `x86_64`; [`scripts/configure-android-abis.sh`](./scripts/configure-android-abis.sh) applies that setting idempotently to the generated app module under the workspace-root ignored `target/`.

The Android build uses Java 21, the Google command-line SDK at `/home/ubuntu/Android/Sdk`, and Dioxus CLI 0.7.10. The project pins API 34, Build Tools 34.0.0, NDK 25.2.9519653, CMake 3.22.1, minimum SDK 24, and native library name `main` in [`Dioxus.toml`](./Dioxus.toml). The full app manifest is prototype-owned at [`assets/android/AndroidManifest.xml`](./assets/android/AndroidManifest.xml); unlike Dioxus's default Android template, it declares no network permission. Android's [networking guide](https://developer.android.com/develop/connectivity/network-ops/connecting) identifies `INTERNET` and `ACCESS_NETWORK_STATE` as permissions used for network operations.

The installed SDK/NDK and all four Dioxus Android Rust targets were already present; no packages were installed for this ABI build. From the prototype directory, the repeatable build/package commands are:

```bash
cd /workspace/hrflow-rust-migration/prototypes/dioxus-hrflow
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/25.2.9519653"
export ANDROID_NDK_ROOT="$ANDROID_NDK_HOME" NDK_HOME="$ANDROID_NDK_HOME"
DX="${DX:-$PWD/target/tooling/dioxus-cli-0.7.10/bin/dx}"
TELEMETRY=false "$DX" build --platform android --release --locked --target aarch64-linux-android
ANDROID_PROJECT=../../target/dx/dioxus-hrflow-prototype/release/android/app
./scripts/configure-android-abis.sh
DEBUG_APK="$ANDROID_PROJECT/app/build/outputs/apk/debug/app-debug.apk"
# dx may emit an auto-signed, debuggable debug APK even for this release build.
# Inspect this exact generated file, then remove only this artifact if present.
if [ -f "$DEBUG_APK" ]; then
  "$ANDROID_SDK_ROOT/build-tools/34.0.0/aapt" dump badging "$DEBUG_APK" | grep '^application-debuggable$'
  "$ANDROID_SDK_ROOT/build-tools/34.0.0/apksigner" verify --verbose --print-certs "$DEBUG_APK"
  rm -- "$DEBUG_APK"
fi
(cd "$ANDROID_PROJECT" && ./gradlew :app:assembleRelease --no-daemon --console=plain)
APK="$ANDROID_PROJECT/app/build/outputs/apk/release/app-release-unsigned.apk"
./scripts/verify-android-apk.sh "$APK"
```

For this run, `dx build` staged ELF AArch64 `libmain.so` at `jniLibs/arm64-v8a/` and retained the x86_64 `libmain.so`. Dioxus also emitted `app-debug.apk` at the exact generated path above; it was debuggable and verified with the standard Android Debug certificate, so only that APK file was removed. The unconfigured Gradle `:app:assembleRelease` task produced the **unsigned universal APK**; no signing configuration was added.

The release artifact is in the workspace-root `target/dx/dioxus-hrflow-prototype/release/android/app/app/build/outputs/apk/release/app-release-unsigned.apk` (SHA-256 `26ab2c0130e9df1a3e145cd50a1764dd60d2ec0ffb3e8011331b46c15a198259`). It has application ID `com.example.DioxusHrflowPrototype`, version `0.1.0` (code 1), minimum/target SDK 24/34, and is not debuggable. Its native libraries are **exactly `arm64-v8a` and `x86_64`**. The merged APK manifest contains only AndroidX's `com.example.DioxusHrflowPrototype.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; it contains neither `INTERNET` nor `ACCESS_NETWORK_STATE`. `apksigner verify` found no valid signature and the ZIP has no signature entries. The original x86_64-only APK is preserved in this prototype's ignored `target/android-baseline/app-release-x86_64-unsigned.apk` (SHA-256 `fd0e06d20e156f9f43337a5af7b6f252bb93635b0f9facf23adab8eed67d0e9d`); if that local copy is present, verify it with `./scripts/verify-android-apk.sh "$PWD/target/android-baseline/app-release-x86_64-unsigned.apk" x86_64`.

Neither APK was installed or distributed. No emulator or device was configured, so this is packaging and metadata proof only—not an Android runtime, UI, accessibility, or TalkBack test.

## Included workflow

The fixture catalog contains three invented employees and August/September 2026 attendance records. Native, labeled employee and month selectors feed typed Rust domain values; summary figures and the semantic, read-only attendance table are derived from the same fixture. “Days present” counts both on-time and late rows, and the attendance rate is present days divided by scheduled sample days, rounded to the nearest whole percent. A valid selection without fixture records displays an explicit empty state.

Each fixture row also carries a **synthetic raw lateness value in minutes**. The “Late after grace” card sums `hrflow_attendance_policy::domain::calculate_chargeable_late_minutes` over the selected rows, via the local Cargo dependency, with the documented demo grace of 15 minutes. This is a read-only view of the shared Rust policy—not a copied formula—and it does not alter row status, scheduled days, days present, late-start counts, or attendance rate. An empty selection displays `—` rather than implying a measured zero.

The layout is responsive, uses visible keyboard focus, keeps status text alongside colors, respects reduced-motion settings, and has no left rail. Pure Rust tests cover summary math, empty data, switching fixtures, selector validation, and the shared-rule aggregate (including zero at 15 minutes and five chargeable minutes for 20 raw minutes). Loading and network-error states are intentionally absent: there is no asynchronous application-data boundary to load or fail.

## Assets and fonts

Inter is bundled locally at [`assets/fonts/inter_variable.ttf`](./assets/fonts/inter_variable.ttf), with its unmodified SIL Open Font License 1.1 text at [`assets/fonts/inter_ofl.txt`](./assets/fonts/inter_ofl.txt). The font face uses the Dioxus-generated asset URL so its release filename can be hashed and still be resolved correctly; the build and browser check confirmed the local same-origin font request. There are no third-party font-host dependencies.

## Verification on this host (2026-10-02)

Workspace formatting and tests passed on 2026-10-02. The verification results are:

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` and `cargo test --workspace --locked` | All workspace members passed; 9 Rust unit/integration tests passed |
| `cargo test --locked` from each member directory | Attendance, leave-entitlements, and Dioxus prototype member commands all passed using the root lockfile |
| `./scripts/verify-rust-workspace.sh` run twice | Both runs passed the exact-member/dependency guard, formatting, locked tests, 18 attendance vectors, and 27 leave fixtures |
| `./scripts/verify-rust-workspace.sh --web` | Dioxus CLI 0.7.10 built the release at workspace-root `target/dx/dioxus-hrflow-prototype/release/web/public`; hashed Inter TTF remained 879,708 bytes |
| `./scripts/verify-rust-workspace.sh --android` | Verified the preserved x86_64-only unsigned baseline APK; no Android rebuild, install, or distribution occurred |
| `cargo fmt --manifest-path ... -- --check` for prototype and both Rust policy crates | All three passed |
| `cargo test --locked` in the prototype | 5/5 prototype tests passed |
| `node scripts/verify-attendance-wasm.mjs` | 18 shared numeric vectors matched the JS helper and actual WASM export |
| `node scripts/verify-leave-entitlements.mjs` | 27 fixtures matched frozen outputs, the JavaScript reference, and Rust |
| `dx build --platform web --release --locked` (Dioxus CLI 0.7.10) | Re-run passed after Android configuration; hashed Inter TTF remained in the release bundle at 879,708 bytes |
| `dx build --platform android --release --locked --target aarch64-linux-android` | Built ARM64 and retained x86_64 native libraries; the generated debug-signed APK was inspected and removed |
| Unconfigured Gradle `:app:assembleRelease` with `arm64-v8a,x86_64` filters | Produced the unsigned universal release APK described above |
| [`scripts/verify-android-apk.sh`](./scripts/verify-android-apk.sh) on universal and preserved x86_64 APKs | Both passed package/version/SDK, no-network-permission, non-debuggable, unsigned-signature, and exact ABI-set checks |

In the live browser, Avery/September displayed `10 / 9 / 2 / 90%` and **1 min** late after grace; selecting Jordan/September changed that to `10 / 9 / 1 / 90%` and **0 min**. The same selector behavior was checked on both the local preview and the temporary public preview. Avery/August displayed `—`, retained the accessible status empty state, and had no attendance table. No browser console messages or page JavaScript exceptions were observed in those checks.

At 390 × 844 CSS pixels, the selector fields stack and the metrics form two columns; a 390 × 1400 capture confirmed the fifth metric wraps to the next grid row and the attendance table remains inside its narrow-screen scroll wrapper. The refreshed `preview.png` is a 1440 × 1370 full-page Chromium capture. The generated same-origin font URL returned HTTP 200 locally and through the temporary preview route.

A short-lived preview is available at [the HRFlow synthetic attendance demo](https://4177-i9944nrtikjagtzvf6pqk-a36c2c6d.us2.manus.computer/). Anyone with that temporary URL can view the synthetic prototype; it is not a permanent deployment.

## Platform and production gaps

The web workflow was browser-verified, and Android was verified at build/package level only. Dioxus 0.7's standard Android mobile path is WebView-based rather than Compose-native widgets. No Android runtime, emulator/device, screen-reader, or TalkBack test occurred; the universal APK contains arm64-v8a and x86_64 native libraries, but has not been installed or run on either architecture. The Gradle build emitted upstream plugin/R8 warnings, but the unsigned release task completed successfully.

There is no Firebase, auth, API client, real local data, persistence, service worker, PWA manifest, offline-data behavior, notification plumbing, or permanent deployment configuration. No performance improvement was measured or is claimed. A future product path would still need platform-specific JavaScript/Kotlin adapters for Firebase and a separate privacy, accessibility, performance, and platform review.

### Android emulator runtime follow-up (2026-10-02)

An emulator feasibility attempt was stopped before AVD creation: installing only the official emulator and Android 34 Google APIs x86_64 image reduced available disk by 5,373,644,800 bytes (5.37 GB), above the 5 GB cap. Both newly installed SDK packages were removed. No emulator boot, APK install or launch, screenshot, runtime permission/network observation, or TalkBack check occurred. See [the detailed emulator verification report](./ANDROID_EMULATOR_VERIFICATION.md) for measurements and the package-level APK verifier result.

## Version references
Dioxus [v0.7.10 release](https://github.com/DioxusLabs/dioxus/releases/tag/v0.7.10) was checked 2026-10-02; the project uses the official 0.7 Web and [Mobile guides](https://dioxuslabs.com/learn/0.7/guides/platforms/mobile). Android setup uses Google's [SDK package installation guide](https://developer.android.com/tools/agents/android-cli/commands/sdk_install), [SDK Manager documentation](https://developer.android.com/tools/sdkmanager), and [networking-permission guide](https://developer.android.com/develop/connectivity/network-ops/connecting).
