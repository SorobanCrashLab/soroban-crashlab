import subprocess
import json
import re
import os
import time

repo = "SorobanCrashLab/soroban-crashlab"

def run_command(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e.stderr}")
        return None

def fetch_issues():
    stdout = run_command([
        "gh", "issue", "list", 
        "--repo", repo,
        "--state", "all", 
        "--limit", "1000", 
        "--json", "number,title,body,state"
    ])
    if stdout:
        return json.loads(stdout)
    return []

def replace_wave(text):
    # Regex to match wave + optional space + 3
    # Case variants:
    # WAVE3 -> WAVE4
    # Wave3 -> Wave4
    # wave3 -> wave4
    # WAVE 3 -> WAVE 4
    # Wave 3 -> Wave 4
    # wave 3 -> wave 4
    
    def replacement(match):
        original = match.group(0)
        # Check for optional space
        space = " " if " " in original else ""
        
        # Check wave casing
        wave_part = original.lower().replace(" ", "").replace("3", "")
        
        if original.startswith("WAVE"):
            new_wave = "WAVE"
        elif original.startswith("Wave"):
            new_wave = "Wave"
        else:
            new_wave = "wave"
            
        return f"{new_wave}{space}4"

    pattern = re.compile(r"\bwave\s?3\b", re.IGNORECASE)
    return pattern.sub(replacement, text)

def update_issue(number, new_body):
    tmp_filename = f"tmp_body_{number}.txt"
    with open(tmp_filename, "w") as f:
        f.write(new_body)
    
    success = False
    for attempt in range(3):
        try:
            subprocess.run([
                "gh", "issue", "edit", str(number),
                "--repo", repo,
                "--body-file", tmp_filename
            ], check=True, capture_output=True)
            success = True
            break
        except subprocess.CalledProcessError:
            time.sleep(2)
            
    if os.path.exists(tmp_filename):
        os.remove(tmp_filename)
    return success

def main():
    issues = fetch_issues()
    total_issues_scanned = len(issues)
    issues_with_wave3_before = 0
    issues_updated = 0
    failed_updates = []

    for issue in issues:
        body = issue.get("body", "")
        if body is None: body = ""
        
        # Check if wave3 exists in body
        if re.search(r"\bwave\s?3\b", body, re.IGNORECASE):
            issues_with_wave3_before += 1
            new_body = replace_wave(body)
            
            if new_body != body:
                if update_issue(issue["number"], new_body):
                    issues_updated += 1
                else:
                    failed_updates.append(issue["number"])

    # Verification
    time.sleep(2) # Give GH API a moment
    refetched_issues = fetch_issues()
    remaining_issues = []
    for issue in refetched_issues:
        body = issue.get("body", "")
        if body is None: body = ""
        if re.search(r"\bwave\s?3\b", body, re.IGNORECASE):
            remaining_issues.append(issue["number"])

    print(f"total_issues_scanned: {total_issues_scanned}")
    print(f"issues_with_wave3_before: {issues_with_wave3_before}")
    print(f"issues_updated: {issues_updated}")
    print(f"failed_updates: {failed_updates}")
    print(f"remaining_count: {len(remaining_issues)}")
    if remaining_issues:
        print(f"remaining_issue_numbers: {remaining_issues}")

if __name__ == "__main__":
    main()
