#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
[[ -f "$DIR/latest-runtime.txt" ]] || { echo "No recorded local runtime."; exit 0; }
RUNTIME="$(cat "$DIR/latest-runtime.txt")"
[[ "$RUNTIME" == "$DIR"/runtime-* && -f "$RUNTIME/processes.json" ]] || { echo "Refusing unrecognized runtime path: $RUNTIME" >&2; exit 1; }
python3 - "$RUNTIME/processes.json" "$DIR/prepared-run.json" <<'PY'
import json,os,signal,socket,sys,time
state=json.load(open(sys.argv[1]))
prepared=json.load(open(sys.argv[2]))
if state.get('projectId') != 'demo-hrflow-u01' or state.get('bind') != '127.0.0.1' or state.get('ports') not in ([4173,8080,9099,9199],[4173,8080,9099,9199,4400,4500,9150]):
    raise SystemExit('Refusing mismatched local process state')
source=state.get('source') or prepared.get('source')
if not source or not source.startswith('/tmp/hrflow-u01-authenticated-') or not source.endswith('/source'):
    raise SystemExit(f'Refusing unexpected throwaway-source path: {source!r}')

def argv(pid):
    try: return open(f'/proc/{pid}/cmdline','rb').read().replace(b'\0',b' ').decode(errors='replace').strip()
    except (FileNotFoundError,ProcessLookupError): return ''
def ppid(pid):
    try:
        for line in open(f'/proc/{pid}/status'):
            if line.startswith('PPid:'): return int(line.split()[1])
    except (FileNotFoundError,ProcessLookupError): pass
    return -1
def current_processes():
    found={}
    for entry in os.listdir('/proc'):
        if not entry.isdigit(): continue
        pid=int(entry); args=argv(pid)
        if args: found[pid]=(ppid(pid),args)
    return found
def descendants(root, snapshot):
    parent_map={pid:parent for pid,(parent,_) in snapshot.items()}
    result={root}; changed=True
    while changed:
        changed=False
        for pid,parent in parent_map.items():
            if parent in result and pid not in result:
                result.add(pid); changed=True
    return result
def is_running(pid, expected):
    now=argv(pid)
    if not now or now != expected: return False
    try:
        state_line=next(x for x in open(f'/proc/{pid}/status') if x.startswith('State:'))
        return 'Z (zombie)' not in state_line
    except (FileNotFoundError,ProcessLookupError,StopIteration): return False

initial=current_processes()
emulator=int(state['emulatorPid']); preview=int(state['previewPid'])
ports=sorted(set(state['ports']) | {4400,4500,9150})
if emulator not in initial or preview not in initial:
    both_roots_gone=not is_running(emulator,initial.get(emulator,(0,''))[1]) and not is_running(preview,initial.get(preview,(0,''))[1])
    open_ports=[]
    for port in ports:
        with socket.socket() as sock:
            sock.settimeout(.2)
            if sock.connect_ex(('127.0.0.1',port)) == 0: open_ports.append(port)
    if both_roots_gone and not open_ports:
        print('Recorded demo emulator and preview are already stopped; all loopback ports are closed.')
        raise SystemExit(0)
    raise SystemExit('Recorded harness root process is no longer present; refusing to guess at replacement PIDs')
emulator_args=initial[emulator][1]
if not all(x in emulator_args for x in ('firebase','emulators:start','--project demo-hrflow-u01','--only auth,firestore,storage')):
    raise SystemExit(f'Refusing unexpected emulator process {emulator}: {emulator_args}')
preview_args=initial[preview][1]
preview_tree=descendants(preview,initial)
if not any(source in initial.get(pid,(0,''))[1] and 'vite' in initial.get(pid,(0,''))[1] and 'preview' in initial.get(pid,(0,''))[1] and '--host 127.0.0.1' in initial.get(pid,(0,''))[1] and '--port 4173' in initial.get(pid,(0,''))[1] for pid in preview_tree):
    raise SystemExit(f'Refusing: recorded preview tree does not contain the expected temporary loopback Vite preview (root={preview_args})')
for pid in preview_tree:
    args=initial.get(pid,(0,''))[1]
    recorded_npm_root=(pid==preview and 'npm run preview' in args and '--host 127.0.0.1' in args and '--port 4173' in args)
    allowed=recorded_npm_root or (pid==preview and ('vite preview' in args or source in args)) or source in args or ('vite preview' in args and '--host 127.0.0.1' in args and '--port 4173' in args)
    if not allowed: raise SystemExit(f'Refusing unexpected process in preview tree: {pid}: {args}')

emulator_tree=descendants(emulator,initial)
for pid in emulator_tree:
    args=initial.get(pid,(0,''))[1]
    allowed=(pid==emulator and 'firebase' in args and 'demo-hrflow-u01' in args) or '/home/ubuntu/.cache/firebase/emulators/' in args or 'demo-hrflow-u01' in args
    if not allowed: raise SystemExit(f'Refusing unexpected process in emulator tree: {pid}: {args}')

# Signal the CLI first so Firebase can shut down its own loopback children cleanly.
os.kill(emulator,signal.SIGINT)
for _ in range(80):
    live=[pid for pid in emulator_tree if is_running(pid,initial.get(pid,(0,''))[1])]
    if not live: break
    time.sleep(.15)
# Terminate only still-live processes from the validated preview tree, leaf first.
for pid in sorted(preview_tree,key=lambda p: len([q for q in preview_tree if q!=p and q in descendants(p,initial)]),reverse=False):
    expected=initial.get(pid,(0,''))[1]
    if is_running(pid,expected):
        try: os.kill(pid,signal.SIGTERM)
        except ProcessLookupError: pass
for _ in range(50):
    live=[pid for pid in preview_tree if is_running(pid,initial.get(pid,(0,''))[1])]
    if not live: break
    time.sleep(.1)
# A final signal is limited to the same already-validated, previously recorded trees.
for pid in emulator_tree | preview_tree:
    expected=initial.get(pid,(0,''))[1]
    if is_running(pid,expected):
        try: os.kill(pid,signal.SIGTERM)
        except ProcessLookupError: pass
for _ in range(50):
    live=[pid for pid in emulator_tree | preview_tree if is_running(pid,initial.get(pid,(0,''))[1])]
    if not live: break
    time.sleep(.1)
for pid in emulator_tree | preview_tree:
    expected=initial.get(pid,(0,''))[1]
    if is_running(pid,expected):
        try: os.kill(pid,signal.SIGKILL)
        except ProcessLookupError: pass
for port in ports:
    with socket.socket() as sock:
        sock.settimeout(.2)
        if sock.connect_ex(('127.0.0.1',port)) == 0:
            raise SystemExit(f'Loopback port {port} remains open after stop; inspect manually')
print('Stopped only the validated demo emulator/temporary preview process trees; loopback ports are closed.')
PY
