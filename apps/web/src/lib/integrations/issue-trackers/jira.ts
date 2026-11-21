// WIP scaffold for issue #2283. Extensible adapter placeholder — no real Jira API calls yet.

export interface ExternalIssueRef {
  provider: "jira";
  id: string;
  url: string;
  status: string;
}

export async function createJiraIssue(_payload: {
  title: string;
  body: string;
}): Promise<ExternalIssueRef> {
  throw new Error("createJiraIssue is not implemented yet (issue #2283)");
}
