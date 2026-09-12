from pathlib import Path
import json, subprocess, sys

base = Path(__file__).resolve().parent
kind, count = sys.argv[1], int(sys.argv[2])
seed = json.loads((base / f"seed-{count}-{kind}.jsonl").read_text(encoding="utf-8").strip().splitlines()[-1])
assert seed["event"] == "seed" and seed["foreignKeyViolations"] == 0
tasks = ([('queue', 'regular-all'), ('queue', 'regular-one-client'),
          ('center', 'center-page1'), ('article', ''), ('startup', '')]
         if kind == 'regular' else [('paid', ''), ('center', 'center-page1'), ('startup', '')])
if len(sys.argv) > 3:
    tasks = [(sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else '')]
for mode, label in tasks:
    destination = base / f"{mode}-{count}-{kind}-{label or 'all'}.jsonl"
    with destination.open('w', encoding='utf-8') as output:
        try:
            result = subprocess.run(['node', str(base / 'probe.cjs'), mode, str(count), str(seed['groups']), kind, seed['workspace'], label],
                                    stdout=output, stderr=subprocess.PIPE, timeout=55)
            if result.returncode:
                output.write(json.dumps({'event':'process-error','code':result.returncode,'stderr':result.stderr.decode(errors='replace')[-2000:]})+'\n')
        except subprocess.TimeoutExpired:
            output.write(json.dumps({'event':'timeout','seconds':55,'mode':mode,'n':count,'kind':kind,'label':label})+'\n')
    print(destination.name, flush=True)
