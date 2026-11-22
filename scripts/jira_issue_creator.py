import os
import sys
import json
import requests
from typing import Dict, Any

# Required environment variables:
#   JIRA_BASE_URL   - e.g., https://your-domain.atlassian.net
#   JIRA_EMAIL      - Email associated with the Jira account (for Basic Auth)
#   JIRA_API_TOKEN - API token generated for the account
#   JIRA_PROJECT_KEY - Project key where issues will be created

def _get_auth_headers() -> Dict[str, str]:
    email = os.getenv("JIRA_EMAIL")
    token = os.getenv("JIRA_API_TOKEN")
    if not email or not token:
        raise EnvironmentError("JIRA_EMAIL and JIRA_API_TOKEN environment variables must be set")
    auth = requests.auth.HTTPBasicAuth(email, token)
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Basic {auth._encode_credentials()}"
    }

def _create_issue(summary: str, description: str) -> Dict[str, Any]:
    base_url = os.getenv("JIRA_BASE_URL")
    project_key = os.getenv("JIRA_PROJECT_KEY")
    if not base_url or not project_key:
        raise EnvironmentError("JIRA_BASE_URL and JIRA_PROJECT_KEY environment variables must be set")
    url = f"{base_url.rstrip('/')}/rest/api/3/issue"
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": description}
                        ]
                    }
                ]
            },
            "issuetype": {"name": "Task"}
        }
    }
    response = requests.post(url, headers=_get_auth_headers(), json=payload)
    response.raise_for_status()
    return response.json()

def _load_crash_report(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _format_issue(report: Dict[str, Any]) -> (str, str):
    # Adjust this logic based on the structure of your crash reports.
    error = report.get("error", "Crash report")
    summary = f"Crash: {error}"[0:100]
    description = json.dumps(report, indent=2)
    return summary, description

def main():
    if len(sys.argv) != 2:
        print("Usage: python jira_issue_creator.py <path_to_crash_report.json>")
        sys.exit(1)
    report_path = sys.argv[1]
    report = _load_crash_report(report_path)
    summary, description = _format_issue(report)
    try:
        result = _create_issue(summary, description)
        key = result.get("key")
        print(f"Successfully created Jira issue {key}")
    except Exception as e:
        print(f"Failed to create Jira issue: {e}")

if __name__ == "__main__":
    main()
