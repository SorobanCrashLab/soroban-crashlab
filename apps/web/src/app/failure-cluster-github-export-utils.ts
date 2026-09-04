import type { FailureCluster } from './failureClusters';
import type { FuzzingRun } from './types';
import { describeFailureCluster } from './failureClusters';

export function buildGitHubIssueUrl(cluster: FailureCluster, representative?: FuzzingRun, repository?: string): string {
  const repo = repository ?? process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? 'SorobanCrashLab/soroban-crashlab';
  const title = `[Crash] ${cluster.signature} (${cluster.count} occurrences)`;
  const lines: string[] = [];
  lines.push(describeFailureCluster(cluster));
  lines.push('');
  lines.push(`**Signature:** \`${cluster.signature}\``);
  lines.push(`**Severity:** ${cluster.severity}`);
  lines.push(`**Occurrences:** ${cluster.count}`);
  lines.push(`**Representative run:** ${cluster.representativeRunId}`);
  lines.push(`**Related runs:** ${cluster.relatedRunIds.join(', ') || '—'}`);
  if (representative?.crashDetail?.payload) {
    lines.push('');
    lines.push('**Crash payload:**');
    lines.push('```json');
    lines.push(representative.crashDetail.payload);
    lines.push('```');
  }
  lines.push('');
  lines.push(`_Generated from CrashLab failure clusters — ${cluster.id}_`);
  const body = lines.join('\n');
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
