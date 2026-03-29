#!/usr/bin/env python3
import subprocess
import json
import sys
import difflib

def get_issues():
    """Fetches open issues using the GitHub CLI (gh)."""
    try:
        # Get open issues with labels, title, and body
        result = subprocess.run(
            ['gh', 'issue', 'list', '--state', 'open', '--json', 'number,title,labels,body'],
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error fetching issues: {e.stderr}", file=sys.stderr)
        return []
    except FileNotFoundError:
        print("gh CLI not found. Please install it to run this script.", file=sys.stderr)
        return []

def find_duplicates(issues, threshold=0.75):
    """Detects near-duplicate issue titles and overlapping scope."""
    collisions = []
    
    # Simple list of words to ignore in scope overlap checks (common template headers)
    ignore_words = {
        'the', 'a', 'is', 'in', 'it', 'to', 'of', 'and', 'for', 'with', 'on', 'at',
        'task', 'summary', 'acceptance', 'criteria', 'complexity', 'area', 'goal',
        'implementation', 'required', 'details', 'notes', 'expected', 'behavior'
    }

    for i in range(len(issues)):
        for j in range(i + 1, len(issues)):
            issue1 = issues[i]
            issue2 = issues[j]
            
            # 1. Similarity by title (Levenshtein-like)
            title_sim = difflib.SequenceMatcher(None, issue1['title'].lower(), issue2['title'].lower()).ratio()
            
            if title_sim >= threshold:
                collisions.append({
                    'type': 'NEAR-DUPLICATE TITLE',
                    'issue1': issue1,
                    'issue2': issue2,
                    'score': title_sim
                })
                continue
            
            # 2. Overlapping scope by common area and keyword overlap
            area1 = set(l['name'] for l in issue1['labels'] if l['name'].startswith('area:'))
            area2 = set(l['name'] for l in issue2['labels'] if l['name'].startswith('area:'))
            
            common_areas = area1.intersection(area2)
            if common_areas:
                # If they share an area, check for significant keyword overlap in body
                words1 = set(w.lower().strip('.,!?()[]') for w in issue1['body'].split() if len(w) > 2 and w.lower() not in ignore_words)
                words2 = set(w.lower().strip('.,!?()[]') for w in issue2['body'].split() if len(w) > 2 and w.lower() not in ignore_words)
                
                if not words1 or not words2:
                    continue
                    
                common_words = words1.intersection(words2)
                overlap_score = len(common_words) / min(len(words1), len(words2))
                
                if overlap_score > 0.4: # 40% keyword overlap within the same area is suspicious
                    collisions.append({
                        'type': 'OVERLAPPING SCOPE',
                        'issue1': issue1,
                        'issue2': issue2,
                        'score': overlap_score
                    })

    return collisions

def main():
    print("--- Issue Audit Report ---")
    issues = get_issues()
    if not issues:
        print("No open issues found to audit.")
        sys.exit(0)

    collisions = find_duplicates(issues)

    if not collisions:
        print("✅ No collisions detected. Backlog is healthy.")
        sys.exit(0)

    print(f"⚠️ Detected {len(collisions)} potential collision(s):\n")
    for c in collisions:
        i1 = c['issue1']
        i2 = c['issue2']
        print(f"[{c['type']}] Similarity Score: {c['score']:.2f}")
        print(f"  #{i1['number']}: {i1['title']}")
        print(f"  #{i2['number']}: {i2['title']}")
        print(f"  Labels: {', '.join(l['name'] for l in i1['labels'])}")
        print("-" * 30)
    
    print("\nPlease review these collisions manually before publishing or labeling for the Wave.")
    sys.exit(1)

if __name__ == "__main__":
    main()
