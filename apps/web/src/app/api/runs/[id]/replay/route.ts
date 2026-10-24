import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { buildMockRuns } from '../../../../mockRuns';
import type { FuzzingRun } from '../../../../types';
import { logger } from '@/lib/logger';
import { successResponse, errorResponse, status } from '@/lib/api-response-utils';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { compareReplayEnvironments, mayRunReplay, parseReplayEnvironment } from '@/lib/replay/environment';
import { classifyReplayFailure, describeReplayFailure } from '@/lib/replay/failure';
import { replayJobStore } from '@/lib/replay/job-store';
import { buildReplayResult, type ReplayDiagnostics } from '@/lib/replay/result';
import { parseReplayRunner, type ReplayRunner } from '@/lib/replay/runners';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FIELD_SEPARATOR = 0x1en;

type ReplayCategory =
  | 'auth'
  | 'budget'
  | 'state'
  | 'xdr'
  | 'invalid-enum-tag'
  | 'empty-input'
  | 'oversized-input'
  | 'unknown';

interface ReplayBundleDocument {
  schema: number;
  seed: {
    id: number;
    payload: number[];
  };
  signature: {
    category: string;
    digest: bigint;
    signature_hash: bigint;
  };
  environment: null;
  failure_payload: number[];
  rpc_envelope: null;
}

interface ReplayInvocationResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Node error code, e.g. `ENOENT` when the runner is not installed. */
  errorCode?: string;
}

export function findRunById(id: string): FuzzingRun | undefined {
  return buildMockRuns().find((run) => run.id === id);
}

function stableRunIdSeed(runId: string): number {
  const trailingDigits = runId.match(/(\d+)$/)?.[1];
  if (trailingDigits) {
    return Number.parseInt(trailingDigits, 10);
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < runId.length; index += 1) {
    hash ^= runId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function classifyReplayPayload(payload: Uint8Array): ReplayCategory {
  if (payload.length === 0) {
    return 'empty-input';
  }

  if (payload.length > 64) {
    return 'oversized-input';
  }

  const first = payload[0];
  if (first <= 0x1f) {
    return 'xdr';
  }
  if (first <= 0x5f) {
    return 'state';
  }
  if (first <= 0x9f) {
    return 'budget';
  }
  return 'auth';
}

function fnv1a64(bytes: Iterable<number>, initialState = FNV64_OFFSET): bigint {
  let hash = initialState;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & 0xffffffffffffffffn;
  }
  return hash;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hexBytes(payload: Uint8Array): Uint8Array {
  const hex = Buffer.from(payload).toString('hex');
  return utf8Bytes(hex);
}

function computeSignatureHash(category: string, payload: Uint8Array): bigint {
  let hash = fnv1a64(utf8Bytes(category));
  hash = fnv1a64([Number(FIELD_SEPARATOR)], hash);
  hash = fnv1a64(utf8Bytes('__payload__'), hash);
  hash = fnv1a64([Number(FIELD_SEPARATOR)], hash);
  return fnv1a64(hexBytes(payload), hash);
}

function computeDigest(seedId: number, payload: Uint8Array): bigint {
  let digest = BigInt(seedId) & 0xffffffffffffffffn;
  for (const byte of payload) {
    digest = (digest * FNV64_PRIME + BigInt(byte)) & 0xffffffffffffffffn;
  }
  return digest;
}

function indentBlock(value: string, indent: string): string {
  return value
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

export function buildReplayBundleDocument(run: FuzzingRun): ReplayBundleDocument {
  if (!run.crashDetail) {
    throw new Error(`run ${run.id} does not include crash details`);
  }

  const payload = utf8Bytes(run.crashDetail.payload);
  const category = classifyReplayPayload(payload);
  const seedId = stableRunIdSeed(run.id);
  const digest = computeDigest(seedId, payload);
  const signatureHash = computeSignatureHash(category, payload);

  return {
    schema: 2,
    seed: {
      id: seedId,
      payload: Array.from(payload),
    },
    signature: {
      category,
      digest,
      signature_hash: signatureHash,
    },
    environment: null,
    failure_payload: Array.from(payload),
    rpc_envelope: null,
  };
}

export function serializeReplayBundleDocument(document: ReplayBundleDocument): string {
  const seedJson = JSON.stringify(document.seed, null, 2);
  const failurePayloadJson = JSON.stringify(document.failure_payload, null, 2);

  return [
    '{',
    `  "schema": ${document.schema},`,
    `  "seed": ${indentBlock(seedJson, '  ')},`,
    '  "signature": {',
    `    "category": ${JSON.stringify(document.signature.category)},`,
    `    "digest": ${document.signature.digest.toString()},`,
    `    "signature_hash": ${document.signature.signature_hash.toString()}`,
    '  },',
    '  "environment": null,',
    `  "failure_payload": ${indentBlock(failurePayloadJson, '  ')},`,
    '  "rpc_envelope": null',
    '}',
  ].join('\n');
}

export function buildReplayCliInvocation(bundlePath: string): { command: string; args: string[] } {
  const manifestPath = path.resolve(
    process.cwd(),
    '..',
    '..',
    'contracts',
    'crashlab-core',
    'Cargo.toml',
  );

  return {
    command: 'cargo',
    args: [
      'run',
      '--quiet',
      '--manifest-path',
      manifestPath,
      '--bin',
      'crashlab',
      '--',
      'replay',
      'seed',
      bundlePath,
    ],
  };
}

async function writeReplayBundleFile(run: FuzzingRun): Promise<{ bundlePath: string; document: ReplayBundleDocument }> {
  const document = buildReplayBundleDocument(run);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crashlab-replay-'));
  const bundlePath = path.join(tempDir, `${run.id}.json`);
  await fs.writeFile(bundlePath, serializeReplayBundleDocument(document), 'utf8');
  return { bundlePath, document };
}

async function executeReplayCli(bundlePath: string): Promise<ReplayInvocationResult> {
  const { command, args } = buildReplayCliInvocation(bundlePath);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      command,
      args,
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    const exitCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
      ? error.code
      : 1;
    const stdout = typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string'
      ? error.stdout
      : '';
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : (error instanceof Error ? error.message : '');

    return {
      command,
      args,
      stdout,
      stderr,
      exitCode,
      ...(errorCode !== undefined ? { errorCode } : {}),
    };
  }
}

async function resolveReplayRun(runId: string): Promise<FuzzingRun | null> {
  const runsApiUrl = process.env.RUNS_API_URL;

  if (runsApiUrl) {
    const upstream = await fetch(`${runsApiUrl}/runs/${encodeURIComponent(runId)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
    });

    if (upstream.status === 404) {
      return null;
    }

    if (!upstream.ok) {
      throw new Error(`upstream run lookup failed with HTTP ${upstream.status}`);
    }

    return (await upstream.json()) as FuzzingRun;
  }

  return findRunById(runId) ?? null;
}

function replayFailureStatus(stderr: string): number {
  if (stderr.includes('replay mismatch:')) {
    return 409;
  }

  return 502;
}

function buildReplayRunId(sourceRunId: string): string {
  return `replay-${sourceRunId}-${randomUUID().slice(0, 8)}`;
}

const MAX_REPLAY_BODY_BYTES = 32 * 1024;

function mockReplay(run: FuzzingRun): ReplayInvocationResult {
  const signature = run.crashDetail?.signature ?? 'unknown signature';
  return {
    command: 'mock-replay',
    args: ['--run-id', run.id, '--signature', signature],
    stdout: `mock runner executed ${run.seedCount} seeds and reproduced ${signature}`,
    stderr: '',
    exitCode: 0,
  };
}

interface ReplayRequestOptions {
  runner: ReplayRunner;
  environment: ReturnType<typeof parseReplayEnvironment>;
  acknowledged: boolean;
  actor: string;
}

async function parseReplayRequest(request: NextRequest): Promise<
  { ok: true; options: ReplayRequestOptions } | { ok: false; message: string }
> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_REPLAY_BODY_BYTES) {
      return { ok: false, message: 'The replay request body is too large.' };
    }
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: 'Expected a JSON object body.' };
      }
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return { ok: false, message: 'Expected a valid JSON body.' };
  }

  const runner = parseReplayRunner(body.runner);
  if (!runner) {
    return {
      ok: false,
      message: `Unsupported replay runner: ${String(body.runner)}. Choose mock, host or rpc-sim.`,
    };
  }

  const actor =
    typeof body.actor === 'string' && body.actor.trim()
      ? body.actor.trim().slice(0, 80)
      : 'anonymous';

  return {
    ok: true,
    options: {
      runner,
      environment: parseReplayEnvironment(body.environment),
      acknowledged: body.acknowledgeMismatch === true,
      actor,
    },
  };
}

/**
 * POST /api/runs/[id]/replay
 *
 * Starts a replay job. The legacy synchronous response shape is preserved
 * (`ok`, `newRunId`, `bundleJson`, `command`, `args`, `stdout`, `stderr`,
 * `exitCode`) and extended with `jobId`, `runner`, `environment` and `result`,
 * so existing callers keep working while the new result page and SSE stream can
 * follow the job.
 *
 * An environment mismatch is a 409 before any job is created; the caller must
 * retry with `acknowledgeMismatch: true`. An unknown runner is a 400.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return errorResponse('Run ID is required', status.badRequest);
  }

  const parsedRequest = await parseReplayRequest(request);
  if (!parsedRequest.ok) {
    return errorResponse(parsedRequest.message, status.badRequest);
  }
  const { runner, environment, acknowledged, actor } = parsedRequest.options;

  try {
    const run = await resolveReplayRun(id);
    const newRunId = buildReplayRunId(id);

    if (!run) {
      return errorResponse('Run not found', status.notFound);
    }

    if (!run.crashDetail) {
      return errorResponse(
        'Run does not include replayable crash details',
        status.unprocessableEntity
      );
    }

    const checklist = compareReplayEnvironments(
      run.replayFingerprint?.components,
      environment,
      acknowledged,
    );

    if (!mayRunReplay(checklist)) {
      return NextResponse.json(
        {
          ok: false,
          error: checklist.summary,
          code: 'REPLAY_ENVIRONMENT_MISMATCH',
          requiresAcknowledgement: true,
          environment: checklist,
        },
        { status: status.conflict },
      );
    }

    const job = replayJobStore.create({
      sourceRunId: run.id,
      runner,
      requestedBy: actor,
      environmentCheck: checklist,
      ...(environment ? { environment } : {}),
    });

    const document = buildReplayBundleDocument(run);
    const bundleJson = serializeReplayBundleDocument(document);
    replayJobStore.appendEvent(job.id, {
      phase: 'bundle',
      message: `Bundle resolved for ${run.crashDetail.signature}.`,
      percent: 15,
    });
    replayJobStore.transition(job.id, 'running');

    if (runner === 'rpc-sim') {
      const failure = describeReplayFailure(
        'runner-unavailable',
        'The RPC simulator runner is not configured for this deployment. Use the host runner or the mock runner.',
      );
      replayJobStore.appendEvent(job.id, {
        phase: 'runner',
        message: failure.message,
        percent: 45,
        level: 'error',
      });
      const finished = replayJobStore.transition(job.id, 'failed', { failure });

      return successResponse(
        {
          ok: false,
          runId: run.id,
          newRunId,
          jobId: job.id,
          runner,
          environment: checklist,
          bundleJson,
          command: 'rpc-sim',
          args: [],
          stdout: '',
          stderr: failure.message,
          exitCode: 1,
          failure,
          status: finished?.status ?? 'failed',
          events: finished?.events ?? [],
        },
        { status: status.serviceUnavailable },
      );
    }

    if (runner === 'mock') {
      const cli = mockReplay(run);
      replayJobStore.appendEvent(job.id, {
        phase: 'runner',
        message: 'Mock runner reproduced the recorded signature.',
        percent: 55,
      });
      replayJobStore.appendEvent(job.id, {
        phase: 'verify',
        message: 'Signature matched.',
        percent: 85,
      });

      const diagnostics: ReplayDiagnostics = {
        command: cli.command,
        args: cli.args,
        stdout: cli.stdout,
        stderr: cli.stderr,
        exitCode: cli.exitCode,
        durationMs: 1,
      };
      const result = buildReplayResult({
        sourceRunId: run.id,
        replayRunId: newRunId,
        diagnostics,
        environment: checklist,
        reproduced: true,
      });
      replayJobStore.transition(job.id, 'succeeded', { result });
      const finished = replayJobStore.appendEvent(job.id, {
        phase: 'done',
        message: 'Replay complete.',
        percent: 100,
      });

      return successResponse({
        ok: true,
        runId: run.id,
        newRunId,
        jobId: job.id,
        runner,
        environment: checklist,
        bundleJson,
        command: cli.command,
        args: cli.args,
        stdout: cli.stdout,
        stderr: cli.stderr,
        exitCode: cli.exitCode,
        result,
        status: finished?.status ?? 'succeeded',
        events: finished?.events ?? [],
      });
    }

    const { bundlePath } = await writeReplayBundleFile(run);
    const tempDir = path.dirname(bundlePath);

    try {
      replayJobStore.appendEvent(job.id, {
        phase: 'runner',
        message: 'Host runner started.',
        percent: 40,
      });

      const startedAt = Date.now();
      const cli = await executeReplayCli(bundlePath);
      const durationMs = Date.now() - startedAt;

      const failure = classifyReplayFailure({
        stderr: cli.stderr,
        exitCode: cli.exitCode,
        runnerMissing: cli.errorCode === 'ENOENT' || cli.errorCode === 'ENOTDIR',
      });

      if (failure) {
        const outcome = failure.reason === 'mismatch' ? 'mismatch' : 'failed';
        replayJobStore.appendEvent(job.id, {
          phase: 'verify',
          message: failure.message,
          percent: 85,
          level: 'error',
        });
        const finished = replayJobStore.transition(job.id, outcome, { failure });
        const httpStatus =
          failure.reason === 'mismatch'
            ? status.conflict
            : failure.reason === 'runner-unavailable'
              ? status.serviceUnavailable
              : replayFailureStatus(cli.stderr);

        return successResponse(
          {
            ok: false,
            runId: run.id,
            newRunId,
            jobId: job.id,
            runner,
            environment: checklist,
            bundleJson,
            command: cli.command,
            args: cli.args,
            stdout: cli.stdout,
            stderr: cli.stderr,
            exitCode: cli.exitCode,
            failure,
            status: finished?.status ?? outcome,
            events: finished?.events ?? [],
          },
          { status: httpStatus },
        );
      }

      const diagnostics: ReplayDiagnostics = {
        command: cli.command,
        args: cli.args,
        stdout: cli.stdout,
        stderr: cli.stderr,
        exitCode: cli.exitCode,
        durationMs,
      };
      const result = buildReplayResult({
        sourceRunId: run.id,
        replayRunId: newRunId,
        diagnostics,
        environment: checklist,
        reproduced: true,
      });

      replayJobStore.appendEvent(job.id, {
        phase: 'verify',
        message: 'Signature matched.',
        percent: 90,
      });
      replayJobStore.transition(job.id, 'succeeded', { result });
      const finished = replayJobStore.appendEvent(job.id, {
        phase: 'done',
        message: 'Replay complete.',
        percent: 100,
      });

      return successResponse({
        ok: true,
        runId: run.id,
        newRunId,
        jobId: job.id,
        runner,
        environment: checklist,
        bundleJson,
        command: cli.command,
        args: cli.args,
        stdout: cli.stdout,
        stderr: cli.stderr,
        exitCode: cli.exitCode,
        result,
        status: finished?.status ?? 'succeeded',
        events: finished?.events ?? [],
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    logger.error('POST /api/runs/[id]/replay failed', { error });
    return errorResponse('Failed to start replay', status.internalError);
  }
}