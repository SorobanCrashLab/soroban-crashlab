/**
 * Server-only replay store, share tokens and access policy (#2341).
 *
 * - Sessions are encrypted at rest with AES-256-GCM. The key is derived from
 *   `CRASHLAB_SESSION_REPLAY_KEY`; without it a random per-process key is
 *   used (replays then do not survive a restart, which is the safe default).
 * - Every ingested batch is re-validated and re-scrubbed here.
 * - Retention (`CRASHLAB_SESSION_REPLAY_RETENTION_DAYS`, default 14) is
 *   enforced on every access; capacity is bounded with oldest-first eviction.
 * - Share links are HMAC-signed, time-bounded tokens bound to one session.
 *
 * Process-local like `reports-store`: the interface is narrow so a durable
 * backend can replace the Map without touching the route.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { recordAuditEvent } from '@/lib/audit';
import { describePrincipal } from '@/lib/rbac';
import { scrubEvent } from '../capture/redaction';
import {
  LIMITS,
  REPLAY_SCHEMA_VERSION,
  summarizeSession,
  type ReplayEvent,
  type ReplaySession,
  type ReplaySessionSummary,
  type SessionMeta,
} from '../capture/schema';
import { buildDemoSessions } from './demo';

export const MAX_SESSIONS = 500;
const DAY = 86_400_000;

export function retentionDays(raw: string | undefined = process.env.CRASHLAB_SESSION_REPLAY_RETENTION_DAYS): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 365 ? value : 14;
}

let ephemeralSecret: Buffer | null = null;
function secret(): Buffer {
  const configured = process.env.CRASHLAB_SESSION_REPLAY_KEY;
  if (configured && configured.length >= 32) return createHash('sha256').update(configured).digest();
  ephemeralSecret ??= randomBytes(32);
  return ephemeralSecret;
}

function encrypt(value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt<T>(blob: Buffer): T {
  const decipher = createDecipheriv('aes-256-gcm', secret(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8')) as T;
}

interface StoredSession {
  summary: ReplaySessionSummary;
  blob: Buffer;
  updatedAt: number;
  lastSeq: number;
}

export class ReplayStore {
  private readonly sessions = new Map<string, StoredSession>();

  constructor(private readonly clock: () => number = Date.now) {
    for (const demo of buildDemoSessions(clock())) this.save(demo, 0);
  }

  private save(session: ReplaySession, seq: number) {
    this.sessions.set(session.id, { summary: summarizeSession(session), blob: encrypt(session), updatedAt: this.clock(), lastSeq: seq });
  }

  /** Drop expired captured sessions; demo sessions are not user data. */
  prune(): void {
    const cutoff = this.clock() - retentionDays() * DAY;
    for (const [id, stored] of this.sessions) {
      if (stored.summary.source === 'captured' && Date.parse(stored.summary.startedAt) < cutoff) this.sessions.delete(id);
    }
    const captured = [...this.sessions.entries()].filter(([, stored]) => stored.summary.source === 'captured');
    if (captured.length > MAX_SESSIONS) {
      captured
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
        .slice(0, captured.length - MAX_SESSIONS)
        .forEach(([id]) => this.sessions.delete(id));
    }
  }

  list(includeCaptured: boolean): ReplaySessionSummary[] {
    this.prune();
    return [...this.sessions.values()]
      .map((stored) => stored.summary)
      .filter((summary) => includeCaptured || summary.source === 'demo')
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }

  get(id: string): ReplaySession | null {
    this.prune();
    const stored = this.sessions.get(id);
    return stored ? decrypt<ReplaySession>(stored.blob) : null;
  }

  all(includeCaptured: boolean): ReplaySession[] {
    return this.list(includeCaptured).flatMap((summary) => {
      const session = this.get(summary.id);
      return session ? [session] : [];
    });
  }

  /**
   * Append a batch. Duplicate or out-of-order sequence numbers are ignored
   * (beacon + fetch can both deliver the same batch on page hide).
   */
  ingest(meta: SessionMeta, seq: number, events: readonly ReplayEvent[], droppedEvents: number): { accepted: number; duplicate: boolean } {
    this.prune();
    const existing = this.sessions.get(meta.id);
    if (existing?.summary.source === 'demo') return { accepted: 0, duplicate: true };
    if (existing && seq <= existing.lastSeq) return { accepted: 0, duplicate: true };
    const session: ReplaySession = existing
      ? decrypt<ReplaySession>(existing.blob)
      : { ...meta, version: REPLAY_SCHEMA_VERSION, durationMs: 0, events: [], droppedEvents: 0, issueLinks: [], incidentIds: [], source: 'captured' };
    const room = Math.max(0, LIMITS.eventsPerSession - session.events.length);
    const accepted = events.slice(0, room).map(scrubEvent);
    session.events = [...session.events, ...accepted];
    session.droppedEvents += droppedEvents + (events.length - accepted.length);
    session.durationMs = Math.max(session.durationMs, ...accepted.map((event) => event.t));
    this.save(session, seq);
    return { accepted: accepted.length, duplicate: false };
  }

  link(id: string, links: { issue?: string; incident?: string }): ReplaySession | null {
    const stored = this.sessions.get(id);
    if (!stored) return null;
    const session = decrypt<ReplaySession>(stored.blob);
    if (links.issue && !session.issueLinks.includes(links.issue)) session.issueLinks = [...session.issueLinks, links.issue].slice(-20);
    if (links.incident && !session.incidentIds.includes(links.incident)) session.incidentIds = [...session.incidentIds, links.incident].slice(-20);
    this.save(session, stored.lastSeq);
    return session;
  }
}

let store: ReplayStore | null = null;
export function getReplayStore(): ReplayStore {
  store ??= new ReplayStore();
  return store;
}
export function resetReplayStore(clock?: () => number): void {
  store = clock ? new ReplayStore(clock) : null;
}

// ─── share tokens ───────────────────────────────────────────────────────────

export const SHARE_TTL_MINUTES = { min: 5, max: 7 * 24 * 60, default: 60 } as const;

function sign(sessionId: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`replay-share:${sessionId}:${expiresAt}`).digest('base64url');
}

export function createShareToken(sessionId: string, ttlMinutes: number, now = Date.now()): { token: string; expiresAt: string } {
  const minutes = Math.min(SHARE_TTL_MINUTES.max, Math.max(SHARE_TTL_MINUTES.min, Math.round(ttlMinutes)));
  const expires = now + minutes * 60_000;
  return { token: `${expires.toString(36)}.${sign(sessionId, expires)}`, expiresAt: new Date(expires).toISOString() };
}

export function verifyShareToken(sessionId: string, token: string, now = Date.now()): boolean {
  const [expiresPart, signature] = token.split('.');
  if (!expiresPart || !signature) return false;
  const expires = parseInt(expiresPart, 36);
  if (!Number.isFinite(expires) || expires <= now) return false;
  const expected = Buffer.from(sign(sessionId, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ─── access policy ──────────────────────────────────────────────────────────

export type ReplayRole = 'anonymous' | 'analyst' | 'maintainer';

export interface ReplayViewer {
  role: ReplayRole;
  subject: string;
  canViewCaptured: boolean;
  canShare: boolean;
}

export async function replayViewer(request: NextRequest): Promise<ReplayViewer> {
  const { principal, role } = await describePrincipal(request);
  const replayRole: ReplayRole = !principal.authenticated ? 'anonymous' : role === 'maintainer' ? 'maintainer' : 'analyst';
  return {
    role: replayRole,
    subject: principal.subject,
    canViewCaptured: replayRole !== 'anonymous',
    canShare: replayRole === 'maintainer',
  };
}

/** Demo sessions are open; captured ones need a signed-in user or a valid share token. */
export function canView(viewer: ReplayViewer, session: Pick<ReplaySession, 'id' | 'source'>, shareToken: string | null): 'role' | 'share' | 'demo' | null {
  if (session.source === 'demo') return 'demo';
  if (viewer.canViewCaptured) return 'role';
  if (shareToken && verifyShareToken(session.id, shareToken)) return 'share';
  return null;
}

export function auditReplay(action: 'replay.view' | 'replay.share' | 'replay.export', viewer: ReplayViewer, sessionId: string, metadata?: Record<string, unknown>): void {
  recordAuditEvent({ action, target: sessionId, actor: viewer.subject, metadata });
}
