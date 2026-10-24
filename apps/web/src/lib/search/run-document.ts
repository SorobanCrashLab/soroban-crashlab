import type { FuzzingRun } from '@/app/types';
import type { SearchDocument, SearchField } from './ranker';

export function runTimestamp(run: FuzzingRun): number | undefined {
  const parsed = Date.parse(run.finishedAt ?? run.startedAt ?? run.queuedAt ?? '');
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function runToSearchDocument(run: FuzzingRun): SearchDocument {
  const fields: SearchField[] = [];
  const add = (key: string, label: string, value: unknown): void => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (text.length === 0) return;
    fields.push({ key, label, value: text });
  };

  add('id', 'Run ID', run.id);
  add('id', 'Parent Run', run.parentId);
  add('status', 'Status', run.status);
  add('area', 'Area', run.area);
  add('severity', 'Severity', run.severity);
  add('contract', 'Contract', run.replayFingerprint?.components.contractWasmHash);
  add('signature', 'Crash Signature', run.crashDetail?.signature);
  add('signature', 'Signature Hash', run.crashDetail?.signatureHash);
  add('category', 'Failure Category', run.crashDetail?.failureCategory);
  add('detail', 'Crash Payload', run.crashDetail?.payload);
  add('detail', 'Replay Action', run.crashDetail?.replayAction);
  add('tags', 'Tags', run.tags?.join(' '));
  add('annotation', 'Annotation', run.annotations?.join(' '));
  add('issue', 'Issue', run.associatedIssues?.map((issue) => issue.label).join(' '));
  add('metric', 'Duration', run.duration);
  add('metric', 'Seed Count', run.seedCount);
  add('metric', 'CPU Instructions', run.cpuInstructions);
  add('metric', 'Memory Bytes', run.memoryBytes);
  add('metric', 'Minimum Resource Fee', run.minResourceFee);
  add('metric', 'Queued At', run.queuedAt);
  add('metric', 'Started At', run.startedAt);
  add('metric', 'Finished At', run.finishedAt);

  return {
    id: run.id,
    fields,
    timestamp: runTimestamp(run),
    count: run.seedCount,
    severity: run.severity,
  };
}
