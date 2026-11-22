
import { getGithubClient } from "src/lib/github-client";
import { audit } from "src/lib/audit";
import { db } from "src/lib/db";

export async function POST(request: Request) {
  const { clusterId, signature, count, runs, actor } = await request.json();
  const client = getGithubClient(); // uses app-installed token or stored OAuth for the org/repo

  const marker = `<!-- crash-signature:${signature} -->`;

  // 1) Search open issues for marker
  // Prefer search API: q="repo:owner/repo in:body \"<!-- crash-signature:...-->\" is:open"
  const searchQuery = `repo:blockchainrafik/soroban-crashlab in:body "${marker}" is:open`;
  const searchRes = await client.searchIssues(searchQuery); // implement wrapper or use octokit

  if (searchRes.total_count > 0) {
    const issue = searchRes.items[0];
    // 2) Comment on existing issue
    const commentBody = `Recurring: cluster ${clusterId}, occurrences now ${count}. Example run: ${runs[0]?.url ?? runs[0]?.id}.`;
    await client.createIssueComment(issue.number, commentBody);

    // 3) Link cluster -> issue in DB
    await db.linkClusterToIssue(clusterId, issue.html_url);

    // 4) Audit
    await audit.record({ actor, action: "comment_on_existing_issue", signature, issueUrl: issue.html_url });

    return new Response(JSON.stringify({ action: "commented", issueUrl: issue.html_url }), { status: 200 });
  }

  // 5) No open issue: create new with marker included
  const issueTitle = `Crash: ${signature} (${/* area */ "unknown"}) — ${count} occurrences`;
  const issueBody = `## Failure Cluster

**Signature:** \`${signature}\`
**Occurrences:** ${count}

**Example runs:**
${runs.map((r)=>`- ${r.url ?? r.id}`).join("\n")}

**Suggested severity:** High

${marker}
`;
  const created = await client.createIssue(issueTitle, issueBody);

  await db.linkClusterToIssue(clusterId, created.html_url);
  await audit.record({ actor, action: "create_issue", signature, issueUrl: created.html_url });

  return new Response(JSON.stringify({ action: "created", issueUrl: created.html_url }), { status: 201 });
}
