# Android emulator runtime verification

**Date:** 2026-10-02

**Outcome:** Blocked before AVD creation; the APK was not installed or run.

## Feasibility and stop reason

The user-local SDK at `/home/ubuntu/Android/Sdk` already had Android Platform 34 and platform-tools 37.0.1, but did not have the Android Emulator, an Android 34 system image, or any configured AVD. `/dev/kvm` was absent. Before attempting an install, 21,256,679,424 bytes were available on the filesystem.

The only allowed packages were installed temporarily with SDK Manager: `emulator` 37.2.12 and `system-images;android-34;google_apis;x86_64` revision 14. The system-image archive was 1,563,721,130 bytes; the emulator archive was approximately 353,843,518 bytes. Although their combined download size was about 1.92 GB, the measured available-disk decrease during installation was **5,373,644,800 bytes (5.37 GB)**, exceeding the 5 GB cap by about 374 MB. The attempt therefore stopped before creating an AVD or starting software emulation. The absence of KVM also meant a software-emulated boot would have been required; no such boot was attempted after the disk limit was exceeded.

Both newly installed SDK packages were immediately uninstalled. The relevant package directories are absent. Available disk measured 21,256,654,848 bytes immediately after rollback (24,576 bytes below the pre-install reading) and 21,256,630,272 bytes after final checks (49,152 bytes below that reading). No existing SDK package was intentionally changed. No AVD was created and no emulator process was started.

## APK checks and test boundary

The existing verifier was run against the exact supplied APK path:

`prototypes/dioxus-hrflow/target/dx/dioxus-hrflow-prototype/release/android/app/app/build/outputs/apk/release/app-release-unsigned.apk`

It passed and reported:

- SHA-256: `26ab2c0130e9df1a3e145cd50a1764dd60d2ec0ffb3e8011331b46c15a198259`
- Application ID: `com.example.DioxusHrflowPrototype`; version `0.1.0` (code 1)
- Minimum/target SDK: 24/34; non-debuggable; unsigned, with no APK signature entries
- Native ABIs: exactly `arm64-v8a` and `x86_64`
- No `INTERNET` or `ACCESS_NETWORK_STATE` permission (the manifest permission listing contains only `com.example.DioxusHrflowPrototype.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`)

This is package-level verification only. The APK was **not installed**, and no app launch or runtime screen was captured. Consequently, neither selector was exercised; the summary changes and Rust-derived late-after-grace value were not checked at runtime; the empty fixture state and phone-portrait layout were not inspected; and no `dumpsys package`, runtime network-request, or TalkBack check was performed. There is no emulator screenshot artifact.

The APK and source were left untouched. This result does not establish Android runtime behavior and does not change the scope of the prototype into a production migration.
