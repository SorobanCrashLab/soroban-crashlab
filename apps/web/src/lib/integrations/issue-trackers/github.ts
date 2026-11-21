// WIP scaffold for issue #2283 (Issue Tracker Sync Hub). No real GitHub API calls,
// auth, or rate-limit handling yet.

export interface ExternalIssueRef {
  provider: "github";
  id: string;
  url: string;
  status: string;
}

export async function createGithubIssue(_payload: {
  title: string;
  body: string;
}): Promise<ExternalIssueRef> {
  throw new Error("createGithubIssue is not implemented yet (issue #2283)");
}
