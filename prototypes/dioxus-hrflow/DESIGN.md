# Prototype design note

## Chosen shape

Candidate A remains selected: one Dioxus page owns employee/month selection, a small pure Rust module owns the typed fixture catalog and summary calculation, and local CSS owns responsive presentation. The existing short path—native select event → validated closed-domain selection → derived snapshot → cards and table—also derives “Late after grace” through the shared `hrflow-attendance-policy` crate, referenced by a local path dependency. The page does not contain a second implementation of chargeable-lateness policy.

Each synthetic attendance row carries an explicit, invented raw lateness value. `late_after_grace_minutes` applies the shared public `calculate_chargeable_late_minutes(raw, 15.0)` function to each selected row and sums the results. The 15-minute grace is a documented demo input. It affects only the added read-only card; fixture status and scheduled/present/late/rate totals remain unchanged. Empty fixture selections return no late summary and display `—`.

The interface model uses closed `EmployeeId`, `Month`, and `DayStatus` enums. Selector values are validated at the DOM boundary; internal calculations accept only those types. A valid selection with no fixture rows yields an explicit empty snapshot, not fabricated data. Existing summary cards and rows continue to come from the same static dataset.

## Alternatives and review

Candidate B proposed separate shell/page/workspace/domain/fixture layers. It was rejected as unnecessary structure for one disposable screen, and its sticky left filter rail conflicted with the no-rail requirement. The independent cross-judge preferred Candidate A for scope fidelity, simplicity, responsive/accessibility fit, and direct testability, recommending one state owner and a small isolated pure summary module; that remains the implemented shape.

Loading and network-error UI remain rejected because there is no asynchronous or external application-data boundary to load or fail. A valid selection with no fixture rows exercises the real empty state instead. The controls remain native and explicitly labeled; table overflow stays inside its own scroll wrapper.

## Verification record

The checks run on 2026-10-02 passed. Prototype formatting and all **5/5 Rust tests** passed, including shared-rule aggregate cases (15 raw minutes → 0, 20 raw minutes → 5) and selected fixture totals (Avery/September → 1, Jordan/September → 0). Attendance and leave cross-checks remained green: 18 attendance fixtures matched the JavaScript helper and WASM export, 27 leave fixtures matched frozen outputs/JavaScript/Rust, and the existing leave JavaScript suite passed **10/10**.

`dx build --platform web --release --locked` was re-run with Dioxus CLI **0.7.10** after Android configuration and succeeded. The release bundle retained the local Inter variable font (879,708 bytes, byte-identical to the source file) at its hashed asset path. Existing browser checks still showed Avery/September at `10 / 9 / 2 / 90%` and **1 min** late after grace, Jordan/September at `10 / 9 / 1 / 90%` and **0 min**, and Avery/August's `—` empty state with no table. Prior desktop and narrow-screen captures confirmed the responsive layout; browser checks observed no page exceptions or console messages.

### Android package build

The project pins Android min/target/compile SDK levels to 24/34/34 and points to a prototype-owned full manifest. Dioxus's default Android template adds `INTERNET`; the custom manifest preserves the native launcher activity but omits network permissions and network security configuration. This keeps the synthetic APK offline as well as avoiding any Firebase/auth integration. The packaged manifest was inspected directly: it contains neither `android.permission.INTERNET` nor `android.permission.ACCESS_NETWORK_STATE`; AndroidX contributes only `com.example.DioxusHrflowPrototype.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.

`dx build --platform android --release` completed with Dioxus CLI 0.7.10 and generated the Android project/native library. In this CLI/Gradle combination, the command also produced `app-debug.apk`, which Gradle had automatically signed with its standard Android debug certificate despite the Rust `--release` flag. That intermediate was inspected and removed; no signing configuration or release key was used. Running the generated project's unconfigured `:app:assembleRelease` task produced `app-release-unsigned.apk`, and [`scripts/verify-android-apk.sh`](./scripts/verify-android-apk.sh) confirmed that it is not debuggable and has no valid APK signature or ZIP signature entries.

The unsigned artifact reports application ID `com.example.DioxusHrflowPrototype`, version `0.1.0` / code 1, min SDK 24 and target SDK 34. It is 3,749,146 bytes with SHA-256 `fd0e06d20e156f9f43337a5af7b6f252bb93635b0f9facf23adab8eed67d0e9d`, and packages only `x86_64/libmain.so`. This is packaging evidence, not an Android runtime test: no emulator/device was configured, and the APK was not installed or launched. The SDK directory measured 2.4 GB, the prototype's ignored `target/` directory 2.8 GB, and 22 GB remained free; the installed toolchain used Java 21, Gradle 9.1.0, Android Gradle Plugin 8.7.0, command-line tools 23.0.0, platform-tools 37.0.1, Build Tools 34.0.0, API 34, NDK 25.2.9519653, and CMake 3.22.1. Gradle emitted upstream SDK/manifest/deprecation and R8 keep-rule warnings, but the release task completed successfully.

The commands and results are packaging verification, not performance evidence. No performance comparison was run, and no speed, memory, or startup improvement is claimed.

## Boundaries

This validates the Dioxus Web flow in a browser and proves that an Android release package can be generated under the local toolchain. It does **not** validate Android UI behavior, device compatibility, TalkBack, or installation; the generated APK is x86_64-only and unsigned. Dioxus's standard Android route is WebView-based, not Compose-native widgets by default. Firebase would still need platform-specific JavaScript/Kotlin adapters. There is no production data, authentication, API, persistence, PWA/offline-data behavior, notification path, or permanent deployment configuration. Inter is bundled with its OFL 1.1 license, but font packaging does not change these platform or production gaps.
