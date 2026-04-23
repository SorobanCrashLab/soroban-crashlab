#!/usr/bin/env python3
import sys
import json
import difflib
import subprocess
import argparse
import os

def get_remote_issues(repo):
    """Fetches open issues using the GitHub CLI (gh)."""
    try:
        result = subprocess.run(
            ['gh', 'issue', 'list', '-R', repo, '--state', 'open', '--json', 'number,title,labels,body'],
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except Exception as e:
        # If gh fails or not authenticated, we just return empty list
        return []

def parse_local_tsv(file_path):
    """Parses local TSV file into a list of issue-like dictionaries."""
    issues = []
    if not os.path.exists(file_path):
        return issues
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            if not lines:
                return issues
            
            # Skip conflict markers if present
            clean_lines = [l for l in lines if not l.startswith(('<<<<<<<', '=======', '>>>>>>>'))]
            if not clean_lines:
                return issues
                
            header = clean_lines[0].strip().split('|')
            # title|complexity|area|type|summary|acceptance|status|issue_number
            
            for i, line in enumerate(clean_lines[1:], start=1):
                parts = line.strip().split('|')
                if not parts or not parts[0]:
                    continue
                
                # Pad parts if needed
                while len(parts) < len(header):
                    parts.append('')
                
                issue_data = dict(zip(header, parts))
                
                # Normalize to match 'gh' output format
                issues.append({
                    'number': f"LOCAL-{i}",
                    'title': issue_data.get('title', ''),
                    'labels': [{'name': issue_data.get('area', '')}, {'name': issue_data.get('complexity', '')}],
                    'body': f"{issue_data.get('summary', '')}\n{issue_data.get('acceptance', '')}",
                    'source': 'LOCAL'
                })
    except Exception as e:
        print(f"Error parsing local file {file_path}: {e}")
        
    return issues

def find_collisions(set1, set2, threshold=0.75):
    """Detects near-duplicate issue titles and overlapping scope between two sets."""
    collisions = []
    
    ignore_words = {
        'the', 'a', 'is', 'in', 'it', 'to', 'of', 'and', 'for', 'with', 'on', 'at',
        'task', 'summary', 'acceptance', 'criteria', 'complexity', 'area', 'goal',
        'implementation', 'required', 'details', 'notes', 'expected', 'behavior'
    }

    # If set2 is the same as set1 (internal check), we only iterate once
    check_internal = (set1 is set2)
    
    for i in range(len(set1)):
        start_j = i + 1 if check_internal else 0
        for j in range(start_j, len(set2)):
            issue1 = set1[i]
            issue2 = set2[j]
            
            if issue1 is issue2:
                continue

            # 1. Similarity by title
            title_sim = difflib.SequenceMatcher(None, issue1['title'].lower(), issue2['title'].lower()).ratio()
            
            if title_sim >= threshold:
                collisions.append({
                    'type': 'NEAR-DUPLICATE TITLE',
                    'issue1': issue1,
                    'issue2': issue2,
                    'score': title_sim
                })
                continue
            
            # 2. Overlapping scope (keyword overlap within same area)
            area1 = set(l['name'] for l in issue1['labels'] if l['name'].startswith('area:'))
            area2 = set(l['name'] for l in issue2['labels'] if l['name'].startswith('area:'))
            
            common_areas = area1.intersection(area2)
            if common_areas:
                words1 = set(w.lower().strip('.,!?()[]') for w in issue1['body'].split() if len(w) > 3 and w.lower() not in ignore_words)
                words2 = set(w.lower().strip('.,!?()[]') for w in issue2['body'].split() if len(w) > 3 and w.lower() not in ignore_words)
                
                if not words1 or not words2:
                    continue
                    
                common_words = words1.intersection(words2)
                overlap_score = len(common_words) / min(len(words1), len(words2))
                
                if overlap_score > 0.4:
                    collisions.append({
                        'type': 'OVERLAPPING SCOPE',
                        'issue1': issue1,
                        'issue2': issue2,
                        'score': overlap_score
                    })

    return collisions

def main():
    parser = argparse.ArgumentParser(description="Detect duplicate issues in backlog or GitHub.")
    parser.add_argument("--local", help="Path to local TSV backlog file")
    parser.add_argument("--repo", default="SorobanCrashLab/soroban-crashlab", help="GitHub repository (owner/repo)")
    parser.add_argument("--threshold", type=float, default=0.75, help="Similarity threshold (0.0 to 1.0)")
    parser.add_argument("--no-remote", action="store_true", help="Skip checking remote GitHub issues")
    
    args = parser.parse_args()

    local_issues = []
    if args.local:
        local_issues = parse_local_tsv(args.local)
        print(f"Loaded {len(local_issues)} issues from local file: {args.local}")

    remote_issues = []
    if not args.no_remote:
        print(f"Fetching open issues from {args.repo}...")
        remote_issues = get_remote_issues(args.repo)
        print(f"Fetched {len(remote_issues)} open issues from GitHub.")

    if not local_issues and not remote_issues:
        print("No issues found to audit.")
        sys.exit(0)

    # 1. Internal check for local issues
    internal_collisions = []
    if local_issues:
        internal_collisions = find_collisions(local_issues, local_issues, args.threshold)

    # 2. Cross-check local vs remote
    cross_collisions = []
    if local_issues and remote_issues:
        cross_collisions = find_collisions(local_issues, remote_issues, args.threshold)

    # 3. Internal check for remote issues (if no local file provided)
    remote_internal_collisions = []
    if not local_issues and remote_issues:
        remote_internal_collisions = find_collisions(remote_issues, remote_issues, args.threshold)

    all_collisions = internal_collisions + cross_collisions + remote_internal_collisions

    if not all_collisions:
        print("\n[OK] No collisions detected. Backlog is healthy.")
        sys.exit(0)

    print(f"\n[WARNING] Detected {len(all_collisions)} potential collision(s):\n")
    for c in all_collisions:
        i1 = c['issue1']
        i2 = c['issue2']
        s1 = i1.get('source', 'REMOTE')
        s2 = i2.get('source', 'REMOTE')
        print(f"[{c['type']}] Similarity Score: {c['score']:.2f}")
        print(f"  Issue A ({s1} #{i1['number']}): {i1['title']}")
        print(f"  Issue B ({s2} #{i2['number']}): {i2['title']}")
        print("-" * 30)
    
    sys.exit(1)

if __name__ == "__main__":
    main()
