// WIP scaffold for issue #2283. Extensible adapter placeholder — no real Linear API calls yet.

export interface ExternalIssueRef {
  provider: "linear";
  id: string;
  url: string;
  status: string;
}

export async function createLinearIssue(_payload: {
  title: string;
  body: string;
}): Promise<ExternalIssueRef> {
  throw new Error("createLinearIssue is not implemented yet (issue #2283)");
}
