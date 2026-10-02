#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPORT="$DIR/prepared-run.json"
[[ -f "$REPORT" ]] || { echo "Missing prepared-run.json; run npm run prepare-local-copy first." >&2; exit 1; }
PROJECT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["projectId"])' "$REPORT")"
SOURCE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source"])' "$REPORT")"
CONFIG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["emulatorConfigPath"])' "$REPORT")"
[[ "$PROJECT" == "demo-hrflow-u01" ]] || { echo "Refusing non-demo Firebase project: $PROJECT" >&2; exit 1; }
[[ "$SOURCE" == /tmp/hrflow-u01-authenticated-*/source ]] || { echo "Refusing source outside the disposable /tmp copy: $SOURCE" >&2; exit 1; }
[[ "$CONFIG" == /tmp/hrflow-u01-authenticated-*/firebase.emulators.json ]] || { echo "Refusing emulator config outside the disposable /tmp copy: $CONFIG" >&2; exit 1; }
[[ -x "$DIR/node_modules/.bin/firebase" ]] || { echo "Firebase CLI missing; run npm ci in the harness directory." >&2; exit 1; }
for port in 4173 8080 9099 9199 4400 4500 9150; do
  if (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then echo "Refusing: loopback port $port is already occupied." >&2; exit 1; fi
done
RUNTIME="$DIR/runtime-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RUNTIME"
echo "$RUNTIME" > "$DIR/latest-runtime.txt"
EMULATOR_LOG="$RUNTIME/firebase-emulators.log"
PREVIEW_LOG="$RUNTIME/vite-preview.log"
nohup env CI=1 FIREBASE_CLI_DISABLE_UPDATE_CHECK=1 GCLOUD_PROJECT="$PROJECT" "$DIR/node_modules/.bin/firebase" emulators:start --project "$PROJECT" --config "$CONFIG" --only auth,firestore,storage --non-interactive >"$EMULATOR_LOG" 2>&1 </dev/null &
EMULATOR_PID=$!
printf '%s\n' "$EMULATOR_PID" > "$RUNTIME/firebase-emulators.pid"
ready=0
for _ in $(seq 1 120); do
  if kill -0 "$EMULATOR_PID" 2>/dev/null && \
     curl -sS -o /dev/null --max-time 1 http://127.0.0.1:9099/ && \
     curl -sS -o /dev/null --max-time 1 http://127.0.0.1:8080/ && \
     curl -sS -o /dev/null --max-time 1 http://127.0.0.1:9199/; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then echo "Local emulator startup failed; see $EMULATOR_LOG" >&2; tail -80 "$EMULATOR_LOG" >&2 || true; kill "$EMULATOR_PID" 2>/dev/null || true; exit 1; fi
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT="$PROJECT" node "$DIR/seed.mjs" > "$RUNTIME/seed.json"
nohup env VITE_SYNTHETIC_EMULATORS=1 VITE_FIREBASE_API_KEY=u01-synthetic-api-key VITE_FIREBASE_AUTH_DOMAIN=127.0.0.1 VITE_FIREBASE_PROJECT_ID="$PROJECT" VITE_FIREBASE_STORAGE_BUCKET="$PROJECT.appspot.com" VITE_FIREBASE_MESSAGING_SENDER_ID=000000000001 VITE_FIREBASE_APP_ID=1:000000000001:web:u01synthetic "$SOURCE/node_modules/.bin/vite" preview --host 127.0.0.1 --port 4173 --strictPort >"$PREVIEW_LOG" 2>&1 </dev/null &
PREVIEW_PID=$!
printf '%s\n' "$PREVIEW_PID" > "$RUNTIME/vite-preview.pid"
ready=0
for _ in $(seq 1 60); do
  if kill -0 "$PREVIEW_PID" 2>/dev/null && curl -sS -o /dev/null --max-time 1 http://127.0.0.1:4173/; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then echo "Local preview startup failed; see $PREVIEW_LOG" >&2; tail -80 "$PREVIEW_LOG" >&2 || true; kill "$PREVIEW_PID" "$EMULATOR_PID" 2>/dev/null || true; exit 1; fi
python3 - "$RUNTIME/processes.json" "$PROJECT" "$EMULATOR_PID" "$PREVIEW_PID" "$SOURCE" <<'PY'
import json,sys
path,project,emulator,preview,source=sys.argv[1:]
with open(path,'w') as f: json.dump({'projectId':project,'emulatorPid':int(emulator),'previewPid':int(preview),'source':source,'bind':'127.0.0.1','ports':[4173,8080,9099,9199,4400,4500,9150]},f,indent=2)
PY
printf 'Emulators and preview are ready.\nProject: %s\nPreview: http://127.0.0.1:4173\nRuntime logs: %s\n' "$PROJECT" "$RUNTIME"
