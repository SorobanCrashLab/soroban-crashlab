# linear_issue_creator.py
"""Utility script to automatically create Linear issues from crash reports.

Prerequisites:
- Install the 'requests' package (`pip install requests`).
- Set the environment variable `LINEAR_API_KEY` with a personal API token that has permission to create issues.

Usage example:
    python linear_issue_creator.py <path_to_crash_report.json>

The script reads a JSON crash report, extracts a title and description, and creates an issue in the specified Linear team.
"""

import os
import sys
import json
import requests

# Linear API endpoint
LINEAR_API_URL = "https://api.linear.app/graphql"

def get_linear_api_key():
    """Fetch Linear API token from environment."""
    token = os.getenv("LINEAR_API_KEY")
    if not token:
        raise EnvironmentError("LINEAR_API_KEY environment variable not set.")
    return token

def create_linear_issue(team_id: str, title: str, description: str):
    """Create an issue in Linear via GraphQL mutation.

    Args:
        team_id: The Linear team identifier where the issue will be created.
        title: Short title of the issue.
        description: Detailed description (e.g., stack trace, logs).
    Returns:
        The created issue's ID if successful.
    """
    headers = {
        "Authorization": f"Bearer {get_linear_api_key()}",
        "Content-Type": "application/json",
    }
    mutation = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
        }
      }
    }
    """
    variables = {
        "input": {
            "teamId": team_id,
            "title": title,
            "description": description,
        }
    }
    payload = {"query": mutation, "variables": variables}
    response = requests.post(LINEAR_API_URL, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    if "errors" in data:
        raise RuntimeError(f"Linear API error: {data['errors']}")
    issue_info = data["data"]["issueCreate"]["issue"]
    return issue_info["id"]

def parse_crash_report(file_path: str):
    """Parse a crash report JSON file and return title & description.

    Expected format (example):
    {
        "error": "NullReferenceException",
        "stackTrace": "...",
        "timestamp": "2026-06-25T12:00:00Z",
        "context": {"userId": "123", "session": "abc"}
    }
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Build a concise title and detailed description
    error = data.get("error", "Crash Report")
    title = f"Crash: {error}"
    description_parts = [json.dumps(data, indent=2)]
    description = "\n".join(description_parts)
    return title, description

def main():
    if len(sys.argv) != 3:
        print("Usage: python linear_issue_creator.py <team_id> <crash_report.json>")
        sys.exit(1)
    team_id = sys.argv[1]
    report_path = sys.argv[2]
    title, description = parse_crash_report(report_path)
    issue_id = create_linear_issue(team_id, title, description)
    print(f"Created Linear issue {issue_id} for report {report_path}")

if __name__ == "__main__":
    main()
