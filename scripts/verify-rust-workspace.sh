#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
invocation_dir="$PWD"
prototype="$root/prototypes/dioxus-hrflow"
run_web=0
run_android=0

usage() {
  printf 'Usage: %s [--web] [--android]\n' "${0##*/}" >&2
}

for arg in "$@"; do
  case "$arg" in
    --web) run_web=1 ;;
    --android) run_android=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

printf '%s\n' 'Checking workspace membership and dependency direction.'
cargo metadata --manifest-path "$root/Cargo.toml" --no-deps --format-version 1 --locked |
  python3 -c '
import json
import os
import sys

root = os.path.realpath(sys.argv[1])
metadata = json.load(sys.stdin)
packages_by_id = {package["id"]: package for package in metadata["packages"]}
expected = {
    os.path.realpath(os.path.join(root, "rust/attendance-policy/Cargo.toml")): "hrflow-attendance-policy",
    os.path.realpath(os.path.join(root, "rust/leave-entitlements/Cargo.toml")): "hrflow-leave-entitlements",
    os.path.realpath(os.path.join(root, "prototypes/dioxus-hrflow/Cargo.toml")): "dioxus-hrflow-prototype",
}
actual_packages = [packages_by_id[package_id] for package_id in metadata["workspace_members"]]
actual = {os.path.realpath(package["manifest_path"]): package["name"] for package in actual_packages}
if actual != expected:
    print(f"FAIL: expected exactly these workspace members: {expected}; found: {actual}", file=sys.stderr)
    raise SystemExit(1)
allowed_dependencies = {
    "hrflow-attendance-policy": set(),
    "hrflow-leave-entitlements": {"serde_json"},
    "dioxus-hrflow-prototype": {"dioxus", "hrflow-attendance-policy"},
}
for package in actual_packages:
    dependencies = {dependency["name"] for dependency in package["dependencies"]}
    package_name = package["name"]
    expected_dependencies = allowed_dependencies[package_name]
    if dependencies != expected_dependencies:
        print(
            f"FAIL: {package_name} dependencies must be {sorted(expected_dependencies)}, "
            f"found {sorted(dependencies)}",
            file=sys.stderr,
        )
        raise SystemExit(1)
print("PASS: exact workspace members and approved dependency edges.")
' "$root"

printf '%s\n' 'Checking Rust formatting.'
cargo fmt --manifest-path "$root/Cargo.toml" --all -- --check

printf '%s\n' 'Running locked workspace tests.'
cargo test --manifest-path "$root/Cargo.toml" --workspace --locked

printf '%s\n' 'Running attendance JavaScript/WASM parity.'
node "$root/scripts/verify-attendance-wasm.mjs"

printf '%s\n' 'Running leave JavaScript/Rust parity.'
node "$root/scripts/verify-leave-entitlements.mjs"

resolve_dx() {
  local candidate="${DX:-$prototype/target/tooling/dioxus-cli-0.7.10/bin/dx}"
  if [[ "$candidate" == */* && "$candidate" != /* ]]; then
    candidate="$invocation_dir/$candidate"
  elif [[ "$candidate" != */* ]]; then
    candidate="$(command -v -- "$candidate" || true)"
  fi
  if [[ -z "$candidate" || ! -x "$candidate" ]]; then
    printf 'Dioxus CLI 0.7.10 not found. Install or set DX to a verified 0.7.10 binary.\n' >&2
    exit 2
  fi
  local version
  version="$("$candidate" --version 2>&1)"
  if [[ "$version" != *0.7.10* ]]; then
    printf 'Expected Dioxus CLI 0.7.10, found: %s\n' "$version" >&2
    exit 2
  fi
  printf '%s\n' "$candidate"
}

if (( run_web )); then
  printf '%s\n' 'Building the Dioxus web release with the pinned CLI.'
  if ! rustup target list --installed | grep -Fxq 'wasm32-unknown-unknown'; then
    printf 'Missing wasm32-unknown-unknown target. Install it using the prototype README instructions.\n' >&2
    exit 2
  fi
  dx="$(resolve_dx)"
  (
    cd -- "$prototype"
    TELEMETRY=false "$dx" build --platform web --release --locked
  )
fi

if (( run_android )); then
  printf '%s\n' 'Verifying an existing unsigned Android release artifact without rebuilding.'
  release_apk="$root/target/dx/dioxus-hrflow-prototype/release/android/app/app/build/outputs/apk/release/app-release-unsigned.apk"
  baseline_apk="$prototype/target/android-baseline/app-release-x86_64-unsigned.apk"
  if [[ -f "$release_apk" ]]; then
    "$prototype/scripts/verify-android-apk.sh" "$release_apk" arm64-v8a,x86_64
  elif [[ -f "$baseline_apk" ]]; then
    "$prototype/scripts/verify-android-apk.sh" "$baseline_apk" x86_64
  else
    printf 'No preserved or generated Android APK is available to verify. See the prototype README for the explicit build procedure.\n' >&2
    exit 2
  fi
fi

printf '%s\n' 'PASS: Rust workspace verification completed.'
