#!/usr/bin/env bash
set -euo pipefail

prototype_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_root="$(cd -- "$prototype_root/../.." && pwd)"
apk="${1:-$workspace_root/target/dx/dioxus-hrflow-prototype/release/android/app/app/build/outputs/apk/release/app-release-unsigned.apk}"
expected_abis="${2:-arm64-v8a,x86_64}"
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
apkanalyzer="$sdk_root/cmdline-tools/latest/bin/apkanalyzer"
debug_apk="$workspace_root/target/dx/dioxus-hrflow-prototype/release/android/app/app/build/outputs/apk/debug/app-debug.apk"

if [[ -e "$debug_apk" ]]; then
  printf 'FAIL: auto-signed debug APK remains in build output: %s\n' "$debug_apk" >&2
  exit 1
fi

if [[ ! -f "$apk" ]]; then
  printf 'APK not found: %s\n' "$apk" >&2
  exit 2
fi
for tool in "$apkanalyzer" "$sdk_root/build-tools/34.0.0/apksigner"; do
  if [[ ! -x "$tool" ]]; then
    printf 'Required Android inspection tool not found: %s\n' "$tool" >&2
    exit 2
  fi
done

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

app_id="$("$apkanalyzer" manifest application-id "$apk")"
version_name="$("$apkanalyzer" manifest version-name "$apk")"
version_code="$("$apkanalyzer" manifest version-code "$apk")"
min_sdk="$("$apkanalyzer" manifest min-sdk "$apk")"
target_sdk="$("$apkanalyzer" manifest target-sdk "$apk")"
debuggable="$("$apkanalyzer" manifest debuggable "$apk")"
permissions="$("$apkanalyzer" manifest permissions "$apk")"

[[ "$app_id" == 'com.example.DioxusHrflowPrototype' ]] || fail "unexpected application id: $app_id"
[[ "$version_name" == '0.1.0' ]] || fail "unexpected version name: $version_name"
[[ "$version_code" == '1' ]] || fail "unexpected version code: $version_code"
[[ "$min_sdk" == '24' ]] || fail "unexpected min SDK: $min_sdk"
[[ "$target_sdk" == '34' ]] || fail "unexpected target SDK: $target_sdk"
[[ "$debuggable" == 'false' ]] || fail "APK is debuggable: $debuggable"

if grep -E 'android\.permission\.(INTERNET|ACCESS_NETWORK_STATE)' <<<"$permissions"; then
  fail 'APK declares network access permission'
fi

signer="$sdk_root/build-tools/34.0.0/apksigner"
if signature_output="$("$signer" verify --verbose --print-certs "$apk" 2>&1)"; then
  fail 'APK is signed; expected an unsigned local verification artifact'
fi
if ! grep -qiE 'DOES NOT VERIFY|Missing META-INF/MANIFEST\.MF|no signatures|no signer' <<<"$signature_output"; then
  printf '%s\n' "$signature_output" >&2
  fail 'Could not establish that the APK is unsigned'
fi
signature_entries="$(unzip -Z1 "$apk" | grep -Ei '^META-INF/.*\.(RSA|DSA|EC|SF)$|^META-INF/MANIFEST.MF$' || true)"
[[ -z "$signature_entries" ]] || fail "APK contains JAR signature entries: $signature_entries"

abis="$(unzip -Z1 "$apk" | sed -n 's#^lib/\([^/]*\)/.*\.so$#\1#p' | sort -u | paste -sd, -)"
[[ -n "$abis" ]] || fail 'APK contains no packaged native Rust libraries'
[[ "$abis" == "$expected_abis" ]] || fail "expected native ABI(s) '$expected_abis', found '$abis'"

printf 'Unsigned Android release APK verified (not installed or distributed).\n'
printf 'Path: %s\n' "$apk"
printf 'SHA-256: '
sha256sum "$apk" | cut -d ' ' -f 1
printf 'Application ID: %s\nVersion: %s (%s)\nMin/target SDK: %s/%s\n' \
  "$app_id" "$version_name" "$version_code" "$min_sdk" "$target_sdk"
printf 'Debuggable: %s\nPermissions: %s\nNative ABI(s): %s\n' \
  "$debuggable" "${permissions//$'\n'/, }" "$abis"
printf 'apksigner: no valid signature; ZIP signature entries: none\n'
