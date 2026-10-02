#!/usr/bin/env bash
set -euo pipefail

prototype_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_root="$(cd -- "$prototype_root/../.." && pwd)"
gradle_file="$workspace_root/target/dx/dioxus-hrflow-prototype/release/android/app/app/build.gradle.kts"

if [[ ! -f "$gradle_file" ]]; then
  printf 'Generated Android app Gradle file not found: %s\n' "$gradle_file" >&2
  printf 'Run dx build --platform android first.\n' >&2
  exit 2
fi

python3 - "$gradle_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
block = '''        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
'''
if text.count(block) == 1:
    print(f"Android ABI filters already configured: {path}")
    raise SystemExit(0)
if "abiFilters" in text:
    raise SystemExit(f"Refusing to replace unexpected ABI filters in {path}")
marker = '        versionName = "0.1.0"\n'
if text.count(marker) != 1:
    raise SystemExit(f"Refusing to patch an unrecognized generated Gradle file: {path}")
path.write_text(text.replace(marker, marker + block, 1))
print(f"Configured arm64-v8a and x86_64 ABI filters in {path}")
PY
