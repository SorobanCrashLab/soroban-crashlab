/**
 * Audit log verification CLI (#1895).
 *
 *   CRASHLAB_AUDIT_CHECKPOINT_KEY=... pnpm --dir apps/web exec jiti scripts/audit-verify.ts \
 *     --input audit.json [--checkpoint checkpoint.json]
 *
 * `--input` is a JSON export (`{ entries: [...] }` from /api/audit/export or a
 * bare array). Entries are re-sorted by sequence before verification. Exits 1
 * and names the first tampered entry when the chain or checkpoint fails.
 */

import fs from 'node:fs';
import { verifyAuditIntegrity, type AuditCheckpoint } from '../src/lib/audit/audit-checkpoint';
import type { AuditEntry } from '../src/lib/audit/audit-log';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = arg('input');
if (!input) {
  console.error('usage: audit-verify.ts --input audit.json [--checkpoint checkpoint.json]');
  process.exit(2);
}

const parsed = JSON.parse(fs.readFileSync(input, 'utf8')) as AuditEntry[] | { entries: AuditEntry[] };
const entries = (Array.isArray(parsed) ? parsed : parsed.entries).slice().sort((a, b) => a.sequence - b.sequence);
const checkpointPath = arg('checkpoint');
const checkpoint = checkpointPath ? (JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as AuditCheckpoint) : null;

const report = verifyAuditIntegrity(entries, checkpoint, process.env.CRASHLAB_AUDIT_CHECKPOINT_KEY);
console.log(JSON.stringify({ entries: entries.length, ...report }, null, 2));
process.exit(report.status === 'broken' || report.checkpoint === 'invalid_signature' ? 1 : 0);
