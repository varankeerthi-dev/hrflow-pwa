#!/usr/bin/env python3
"""Validate the latest U01 synthetic capture, emit route timings, and append its evidence to baseline/README.md."""
import csv
import json
import os
import platform
import re
import struct
import subprocess
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASELINE = HERE.parent
README = BASELINE / "README.md"
MARKER = "<!-- authenticated-synthetic-baseline:start -->"
PROJECT = "demo-hrflow-u01"

run_id = (HERE / "latest-run.txt").read_text().strip()
if not re.fullmatch(r"run-[A-Za-z0-9T.Z-]+", run_id):
    raise SystemExit(f"Refusing unexpected run identifier: {run_id!r}")
run_dir = HERE / run_id
manifest_path = run_dir / "capture-manifest.json"
manifest = json.loads(manifest_path.read_text())
if manifest.get("projectId") != PROJECT:
    raise SystemExit(f"Refusing unexpected project ID: {manifest.get('projectId')!r}")

prepared = json.loads((HERE / "prepared-run.json").read_text())
if prepared.get("projectId") != PROJECT or not str(prepared.get("source", "")).startswith("/tmp/hrflow-u01-authenticated-"):
    raise SystemExit("Refusing unexpected prepared source copy or Firebase project")
runtime_dir = Path((HERE / "latest-runtime.txt").read_text().strip())
if runtime_dir.parent != HERE or not runtime_dir.name.startswith("runtime-"):
    raise SystemExit("Refusing unexpected emulator runtime path")
seed = json.loads((runtime_dir / "seed.json").read_text())
if seed.get("projectId") != PROJECT:
    raise SystemExit("Seed output project ID does not match the demo project")

# Recheck that the only durable browser evidence are readable, correctly sized PNGs.
pngs = sorted(run_dir.rglob("*.png"))
if len(pngs) != len(manifest.get("captures", [])):
    raise SystemExit(f"Capture/PNG count mismatch: {len(manifest.get('captures', []))} rows, {len(pngs)} PNGs")
image_bytes = 0
for path in pngs:
    raw = path.read_bytes()
    if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise SystemExit(f"Invalid or incomplete PNG: {path}")
    width, height = struct.unpack(">II", raw[16:24])
    item = next((c for c in manifest["captures"] if c["screenshot"] == str(path.relative_to(run_dir))), None)
    if item is None:
        raise SystemExit(f"PNG has no capture manifest row: {path}")
    expected = item["dimensionsCssPx"]
    if (width, height) != (expected["width"], expected["height"]):
        raise SystemExit(f"PNG/viewport mismatch for {path}: {(width, height)} != {expected}")
    image_bytes += len(raw)

# Confirm that production's source-default Firebase project ID is absent from the throwaway build.
dist = Path(prepared["source"]) / "dist"
if not dist.is_dir():
    raise SystemExit(f"Throwaway build output is missing: {dist}")
production_id_found = []
for path in dist.rglob("*"):
    if path.is_file() and b"attendance-108ba" in path.read_bytes():
        production_id_found.append(str(path))
if production_id_found:
    raise SystemExit(f"Production Firebase ID found in throwaway build: {production_id_found}")

# Keep an exact, machine-readable per-destination timing trace alongside the JSON manifest.
timing_csv = run_dir / "route-timing-traces.csv"
with timing_csv.open("w", newline="", encoding="utf-8") as f:
    fields = ["persona", "role", "surface", "routeId", "requestedRoute", "observedUrl", "widthCssPx", "heightCssPx", "devicePixelRatio", "actionDurationMs", "settledForMs", "navigationResponseStartMs", "navigationDomContentLoadedMs", "navigationLoadEventEndMs", "navigationDurationMs", "transferSize", "encodedBodySize", "decodedBodySize", "screenshot"]
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for item in manifest["captures"]:
        viewport = item["dimensionsCssPx"]
        timing = item.get("navigationTimingMsAndBytes") or {}
        writer.writerow({
            "persona": item["persona"], "role": item["role"], "surface": item["surface"],
            "routeId": item["routeId"], "requestedRoute": item["requestedRoute"], "observedUrl": item["observedUrl"],
            "widthCssPx": viewport["width"], "heightCssPx": viewport["height"], "devicePixelRatio": viewport["devicePixelRatio"],
            "actionDurationMs": item["actionDurationMs"], "settledForMs": item["settledForMs"],
            "navigationResponseStartMs": timing.get("responseStart", ""),
            "navigationDomContentLoadedMs": timing.get("domContentLoadedEventEnd", ""),
            "navigationLoadEventEndMs": timing.get("loadEventEnd", ""),
            "navigationDurationMs": timing.get("duration", ""), "transferSize": timing.get("transferSize", ""),
            "encodedBodySize": timing.get("encodedBodySize", ""), "decodedBodySize": timing.get("decodedBodySize", ""),
            "screenshot": item["screenshot"]
        })

matrix_path = BASELINE.parent / "role-surface-matrix.tsv"
with matrix_path.open(encoding="utf-8", newline="") as f:
    matrix = list(csv.DictReader(f, delimiter="\t"))
category_counts = Counter(row["surface"] for row in matrix)
role_surface_counts = Counter((row["surface"], row["case_id"].split("-")[1] if "-" in row["case_id"] else "other") for row in matrix)
capture_counts = Counter((item["surface"], item["persona"], item["role"]) for item in manifest["captures"])

blocked_urls = sorted({r["url"] for r in manifest["networkPolicy"]["blockedExternalRequests"]})
allowed_origins = manifest["networkPolicy"]["allowedOriginsObserved"]
errors_by_kind = Counter(r["kind"] for r in manifest["browserErrors"])
failed_by_reason = Counter(r["failure"] for r in manifest["failedRequests"])

# Derive exact state evidence from the observed DOM fields. The full 700-char DOM excerpt remains in JSON.
def cell(value):
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")

def code(value):
    return "`" + cell(value) + "`"

rows = []
for index, item in enumerate(manifest["captures"], 1):
    vp = item["dimensionsCssPx"]
    heads = json.dumps(item.get("observedHeadings", []), ensure_ascii=False, separators=(",", ":"))
    empty = json.dumps(item.get("observedEmptyText", []), ensure_ascii=False, separators=(",", ":"))
    excerpt = item.get("observedTextExcerpt", "")
    excerpt = excerpt[:180] + ("…" if len(excerpt) > 180 else "")
    note = item.get("stateNote", "")
    state = f"h={heads}; empty-regex={empty}; text-prefix={json.dumps(excerpt, ensure_ascii=False)}"
    if note:
        state += f"; note={json.dumps(note, ensure_ascii=False)}"
    shot = f"./authenticated-synthetic/{run_id}/{item['screenshot']}"
    rows.append("| " + " | ".join([
        str(index), code(item["persona"] + " / " + item["role"]), item["surface"],
        f"{vp['width']}×{vp['height']} DPR {vp['devicePixelRatio']}", code(item["routeId"]),
        code(item["requestedRoute"]), code(item["observedUrl"]), code(state),
        f"{item['actionDurationMs']:.1f} / {item['settledForMs']}",
        f"[PNG]({shot})"
    ]) + " |")

persona_lines = [f"- `{surface}` — `{persona}` (role `{role}`): **{count}** capture(s)." for (surface, persona, role), count in sorted(capture_counts.items())]
failed_by_url = Counter(r["url"] for r in manifest["failedRequests"])
blocked_lines = [f"- `{url}` — {failed_by_url.get(url, 0)} intercepted failed event(s)." for url in blocked_urls]
allowed_lines = [f"- `{origin}`" for origin in manifest["networkPolicy"]["allow"]]
error_counts_text = ", ".join(f"{kind}={count}" for kind, count in sorted(errors_by_kind.items())) or "none"
failed_counts_text = ", ".join(f"`{reason}`={count}" for reason, count in sorted(failed_by_reason.items())) or "none"

try:
    npm_version = subprocess.check_output(["npm", "--version"], cwd=HERE, text=True).strip()
    firebase_version = subprocess.check_output([str(HERE / "node_modules/.bin/firebase"), "--version"], cwd=HERE, text=True).strip()
    playwright_version = subprocess.check_output(["node", "-p", "require('./node_modules/playwright-core/package.json').version"], cwd=HERE, text=True).strip()
    vite_version = subprocess.check_output(["node", "-p", f"require({json.dumps(str(Path(prepared['source']) / 'node_modules/vite/package.json'))}).version"], cwd=HERE, text=True).strip()
except (OSError, subprocess.CalledProcessError) as error:
    raise SystemExit(f"Could not verify required tool versions: {error}")

seed_auth_count = len(seed.get("personas", []))
expected_data_counts = f"Auth emulator accounts: {seed_auth_count}; Firestore `users` profile documents: {seed_auth_count}; organization documents: 1; employee documents: 1."
if seed_auth_count != 8:
    raise SystemExit(f"Unexpected synthetic Auth account count: {seed_auth_count}")

appendix = f'''{MARKER}

## Authenticated synthetic baseline extension — {manifest['generatedAt']}

**Scope result: this completes only the authenticated synthetic screenshot portion requested for Unit 1; Unit 1 remains open and is not signed off.** This supplements, and does not replace, the earlier signed-out measurements above. No existing application source file, migration plan, decision log, role/surface matrix, source-contract inventory, protected PWA checkout, production Firebase project, live Firebase project, or actual user/account data was modified or used. Durable changes are confined to this baseline README and its new evidence/harness subdirectory; the throwaway app build was under `/tmp`.

### Fixture and local-only environment

- **Baseline commit:** `{prepared['sourceCommit']}` (the temporary app build was archived from this exact commit; source default project `attendance-108ba` is absent from its built `dist`). The throwaway source copy and build root used for this run was `{prepared['root']}`; `prepared-run.json` records the copy and project ID.
- **Synthetic Firebase Emulator project ID:** `{PROJECT}`. Auth, Firestore, and Storage emulators were started from a temporary config pointing to the archived source's unchanged `firestore.rules` and `storage.rules`. The Vite preview and three service endpoints were verified bound only to `127.0.0.1` (`4173`, `8080`, `9099`, `9199`). The Firebase CLI also reported its Emulator Hub on loopback port `4400` and reserved ports `4500` and `9150` (Firestore WebSocket); those auxiliary ports were not in the browser allowlist. The seeder resets only the Auth/Firestore emulator data for this demo ID and uses Auth-emulator-issued tokens for Firestore commits; the source rules were not weakened or edited.
- **Seed counts:** {expected_data_counts} The only business data seeded were `users`, `organisations/u01-synthetic-org`, and `organisations/u01-synthetic-org/employees/u01-synthetic-employee`; other business collections were intentionally empty. Synthetic personas are admin, employee-default, view/create/edit/delete/approve-only staff, and all-false staff; all addresses use the reserved `.invalid` domain. Exact synthetic Auth UIDs, local emulator IDs, names, and permission maps are in [the seed record](./authenticated-synthetic/{runtime_dir.name}/seed.json); passwords/tokens are not in that record. An early Admin SDK seeding attempt emitted `MetadataLookupWarning` with HTTP 401 during default credential discovery; that path was removed. The final seeder uses direct REST calls only to the Auth (`127.0.0.1:9099`) and Firestore (`127.0.0.1:8080`) emulators; no Firebase login or service-account credential was used. A direct unauthenticated fixture commit was rejected by the unchanged Firestore rules with HTTP 403; final seeding uses each synthetic Auth user's emulator token for its own profile, then the admin emulator token for the organization and employee. No rules change was made.
- **Build/tool versions:** Chromium `{manifest['browser']['version']}` (`{manifest['browser']['executablePath']}`, headless); Node `{manifest['runtime']['node']}`; npm `{npm_version}`; Firebase CLI `{firebase_version}`; Playwright Core `{playwright_version}`; Vite `{vite_version}`; Linux `{manifest['runtime']['kernel']}` / `{manifest['runtime']['platform']} {manifest['runtime']['arch']}`, {manifest['runtime']['cpus']} logical CPUs. The local Auth/Firestore emulator origins were observed; **no browser request to Storage was made** (the Storage emulator was started but no storage flow was exercised).
- **Viewports:** desktop {manifest['viewports']['desktop']['width']}×{manifest['viewports']['desktop']['height']} CSS px, DPR {manifest['viewports']['desktop']['deviceScaleFactor']}; mobile emulation {manifest['viewports']['mobile']['width']}×{manifest['viewports']['mobile']['height']} CSS px, DPR {manifest['viewports']['mobile']['deviceScaleFactor']}, touch enabled. Mobile screenshots are viewport emulation, not physical-device captures.
- **Capture totals:** {len(manifest['captures'])} PNGs, {image_bytes:,} bytes total; all headers/dimensions were checked against the manifest. Distribution: {sum(1 for c in manifest['captures'] if c['surface']=='desktop')} desktop and {sum(1 for c in manifest['captures'] if c['surface']=='mobile')} mobile screenshots. Browser action/settling timing and original navigation entries are in [the raw JSON manifest](./authenticated-synthetic/{run_id}/capture-manifest.json) and [the per-case timing CSV](./authenticated-synthetic/{run_id}/route-timing-traces.csv). `actionDurationMs` measures the harness navigation/selection action, `settledForMs` is the fixed wait before the screenshot; `navigationTimingMsAndBytes` is the document navigation entry (SPA tab changes reuse that entry), not a per-module network benchmark. These measurements are not merged with the 20 cache-cleared no-login `/login` repetitions above.

### Network containment and observed blocked requests

**Browser allowlist:**
{os.linesep.join(allowed_lines)}

**Full non-local block applied by the browser harness (verbatim):**

> {manifest['networkPolicy']['deny']}

Observed browser origins were only {', '.join(f'`{x}`' for x in allowed_origins)}. {len(blocked_urls)} distinct outside-allowlist attempts were intercepted and aborted; all were font CSS requests. Full blocked URLs:
{os.linesep.join(blocked_lines)}

The raw trace records {len(manifest['networkPolicy']['blockedExternalRequests'])} distinct blocked URL entries, {len(manifest['failedRequests'])} failed request events ({failed_counts_text}), {len(manifest['networkPolicy'].get('websocketAttempts', []))} WebSocket attempts, and browser console errors by type: {error_counts_text}. All {errors_by_kind.get('console-error', 0)} console errors were `net::ERR_BLOCKED_BY_CLIENT.Inspector` for the intentionally blocked font requests; there were **{errors_by_kind.get('pageerror', 0)} page-level JavaScript errors**. Blocked fonts mean captured pages render with fallback fonts. No request outside the loopback allowlist was permitted to reach its destination.

### Coverage and exact observations

The current role/surface audit contains **{len(matrix)} rows** ({', '.join(f'`{surface}`={count}' for surface, count in sorted(category_counts.items()))}); it was not edited, and this appendix does not freeze `R` or change the decision log. Admin coverage captured all {len(set(r['source_route_id'] for r in matrix if r['surface']=='desktop'))} desktop registry IDs and all {len(set(r['source_route_id'] for r in matrix if r['surface']=='mobile'))} mobile registry IDs, plus the authenticated legacy routes/aliases and unknown-path result below. Matrix role-permission variants are sampled rather than exhaustive. Capture counts by fixture:

{os.linesep.join(persona_lines)}

The all-false desktop `/?tab=employees` attempt normalized to the observed URL in the capture row; the mobile all-false drawer showed only the visible client destinations, while the view-only fixture exposed Employees on mobile. These are client visibility/redirect outcomes only. They do not establish Firestore/Storage/backend authorization.

Each row below records the actual role/persona, requested and observed route, DOM heading and empty-text detector arrays, exact initial DOM text prefix, viewport, action duration and settling delay, and screenshot. The unabridged state/text/navigation values are in the JSON manifest. “Empty regex” is the harness's literal text detector output; it is not a manually inferred empty/error label.

| # | Persona / client role | Surface | Viewport | Case / route ID | Requested route | Observed URL | Exact observed DOM signals | Action ms / settled ms | Screenshot |
|---:|---|---|---:|---|---|---|---|---:|---|
{os.linesep.join(rows)}

### Error, denied, and coverage gaps

- **Observed loading state:** one desktop synthetic-admin sign-in screenshot shows `Signing in…` while the harness deliberately held the local Auth-emulator password-sign-in response for 1,200 ms. This is a controlled transient UI capture, not an unmodified sign-in latency measurement.
- **Observed empty states:** route-specific strings are reported exactly as captured in each row/manifest. **No application error or backend-permission-denied state appeared or was claimed.** The all-false direct-query rewrite and hidden mobile drawer item are client behavior, not server denial. No write/delete/approval/export action, form submit, or business mutation was issued.
- **Route limits:** the admin matrix IDs and selected global paths are covered, but not all matrix combinations. Employee desktop was sampled at Home, My Portal, and Vehicle; employee mobile at Home, My Portal, Vehicles, and Tasks. Non-admin one-hot view/create/edit/delete/approve behavior was sampled at desktop Employees; view-only drawer/Employees and all-false desktop/mobile navigation were also captured. Other non-admin permissions against every desktop/mobile module, export-only cases, category filters, fixed bottom aliases other than Attendance, query edge cases beyond those captured, and every `shared-destination-role-state` combination remain uncovered.
- **Data/workflow limits:** no real or broad business dataset was seeded; workflow/modal/confirm/recovery states and their query/document counts or payload sizes were not measured. No offline, stale-cache, denied-read/write, retry, conflict, unknown app error, listener teardown, persistence-clearing, push/notification, Storage upload/download, service-worker lifecycle, or export flow was exercised. The Storage emulator was not invoked. Thus no application-level error or server-authorization conclusion is possible from this baseline.
- **Unit 1 still-open criteria:** this screenshot extension does not finish all source-contract/workflow evidence, every role/surface row, data/query/payload counts, offline/denied/error/recovery evidence, or the decision-log `R`/`W` freeze and performance formula gates. The migration plan, matrix, and decision log remain unchanged.

### Reproduction commands

From the repository root, use the evidence harness directory; the scripts refuse a non-demo Firebase project, a source directory outside the throwaway `/tmp` copy, a non-loopback browser request, or an occupied required local port:

```sh
cd /workspace/hrflow-rust-migration/.audit/rust-web-migration-evidence/U01/baseline/authenticated-synthetic
npm ci --ignore-scripts --no-audit --no-fund
npm run prepare-local-copy
./start-local.sh
npm run capture
python3 append-readme.py
./stop-local.sh
```

`prepare-local-copy` archives only commit `{prepared['sourceCommit']}` into `/tmp`, replaces Firebase build values only in that throwaway copy with `demo-hrflow-u01` / inert local emulator settings, installs/builds there, and verifies the build does not contain `attendance-108ba`. `start-local.sh` starts only local Auth/Firestore/Storage emulators, runs the deterministic synthetic seed, and binds the Vite preview to loopback.

`capture.mjs` launches a fresh Chromium context per persona, blocks service workers/proxies/non-loopback HTTP(S) and WebSockets, and writes a new run folder; `append-readme.py` replaces only this marker-delimited appendix and re-emits the route timing CSV.

`stop-local.sh` signals only the recorded demo-emulator and temporary-Vite process trees after validating their project/source/loopback arguments, then verifies all seven service and auxiliary ports are closed. It is safe to run again after a completed shutdown.

<!-- authenticated-synthetic-baseline:end -->
'''

previous = README.read_text(encoding="utf-8")
if MARKER in previous:
    previous = previous.split(MARKER, 1)[0].rstrip() + "\n"
else:
    previous = previous.rstrip() + "\n"
README.write_text(previous + "\n" + appendix, encoding="utf-8")
print(json.dumps({"readme": str(README), "runId": run_id, "captures": len(manifest["captures"]), "screenshots": len(pngs), "screenshotBytes": image_bytes, "matrixRows": len(matrix), "timingCsv": str(timing_csv), "appendixBytes": len(appendix.encode("utf-8"))}, indent=2))
