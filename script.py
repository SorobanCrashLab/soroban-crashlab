import csv, subprocess, json, sys
from pathlib import Path
root=Path('/home/trinnex/Documents/CodeBase/drips/WAVE4/soroban-crashlab')
canon=root/'ops/wave4-canonical.tsv'

wanted=[]
with canon.open() as f:
    r=csv.DictReader(f, delimiter='|')
    for row in r:
        if row.get('status','').strip().lower()=='implemented':
            continue
        wanted.append(row['title'].strip())

print(f"DEBUG: Found {len(wanted)} wanted titles in TSV", file=sys.stderr)

res=subprocess.run([
    'gh','issue','list','--repo','SorobanCrashLab/soroban-crashlab','--state','open','--limit','1000','--json','title,labels'
],capture_output=True,text=True)
if res.returncode != 0:
    print(f"ERROR running gh: {res.stderr}", file=sys.stderr)
    sys.exit(1)

issues=json.loads(res.stdout)
open_wave4=[i['title'].strip() for i in issues if any(l['name']=='wave4' for l in i.get('labels',[]))]
print(f"DEBUG: Found {len(open_wave4)} open wave4 issues on GitHub", file=sys.stderr)
open_set=set(open_wave4)

missing=[t for t in wanted if t not in open_set]
print('wanted_non_implemented=',len(wanted))
print('open_wave4_count=',len(open_wave4))
print('missing_count=',len(missing))
for t in missing[:80]:
    print('MISSING',t)
