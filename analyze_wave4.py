import subprocess
import json
import csv
import re
import sys

def normalize_title(title):
    title = re.sub(r'\s+\[\d+\]$', '', title)
    return title.strip().lower()

try:
    canonical_titles = set()
    with open('ops/wave4-canonical.tsv', 'r') as f:
        reader = csv.reader(f, delimiter='\t')
        for row in reader:
            if row and row[0].strip():
                canonical_titles.add(normalize_title(row[0]))

    res = subprocess.run([
        'gh', 'issue', 'list',
        '--repo', 'SorobanCrashLab/soroban-crashlab',
        '--state', 'open',
        '--label', 'wave4',
        '--limit', '1000',
        '--json', 'number,title,createdAt'
    ], capture_output=True, text=True)

    issues = json.loads(res.stdout)

    open_titles = {} 
    for issue in issues:
        norm = normalize_title(issue['title'])
        if norm not in open_titles:
            open_titles[norm] = []
        open_titles[norm].append(issue)

    open_wave4_count = len(issues)
    canonical_non_implemented_count = len(canonical_titles)
    open_norms = set(open_titles.keys())
    canonical_missing_in_open = canonical_titles - open_norms
    open_not_in_canonical_norms = open_norms - canonical_titles
    duplicates = {k: v for k, v in open_titles.items() if len(v) > 1}
    open_in_canonical = open_norms.intersection(canonical_titles)

    print(f"open_wave4_count: {open_wave4_count}")
    print(f"canonical_non_implemented_count: {canonical_non_implemented_count}")
    print(f"canonical_missing_in_open count: {len(canonical_missing_in_open)}")
    print(f"open_not_in_canonical count: {len(open_not_in_canonical_norms)}")

    if open_not_in_canonical_norms:
        print("open_not_in_canonical list:")
        for norm in sorted(open_not_in_canonical_norms):
            for issue in open_titles[norm]:
                 print(f"  #{issue['number']} - {issue['title']}")

    print(f"normalized duplicate-title groups: {len(duplicates)}")
    for norm in sorted(duplicates.keys()):
        iss_list = duplicates[norm]
        print(f"  Group '{norm}': " + ", ".join([f"#{i['number']}" for i in iss_list]))

    print(f"open wave4 issues in canonical_non_implemented: {len(open_in_canonical)}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
