/** Session lifecycle, invites and RBAC for collaborative debugging (#2205). */

export type SessionStatus = 'active' | 'ended';

export interface Participant {
  id: string;
  role: 'host' | 'guest';
  joinedAt: number;
  away?: boolean;
}

export interface DebugSession {
  id: string;
  runId: string;
  hostId: string;
  participants: Participant[];
  status: SessionStatus;
  createdAt: number;
  inviteToken: string;
}

/** Deterministic, secret-free invite token (not a security credential). */
export function inviteToken(sessionId: string, runId: string): string {
  const input = `${sessionId}:${runId}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export class SessionManager {
  private readonly sessions = new Map<string, DebugSession>();

  create(id: string, runId: string, hostId: string, now = Date.now()): DebugSession {
    if (this.sessions.has(id)) throw new Error(`Session already exists: ${id}`);
    const session: DebugSession = {
      id,
      runId,
      hostId,
      participants: [{ id: hostId, role: 'host', joinedAt: now }],
      status: 'active',
      createdAt: now,
      inviteToken: inviteToken(id, runId),
    };
    this.sessions.set(id, session);
    return { ...session, participants: [...session.participants] };
  }

  get(id: string): DebugSession | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session, participants: [...session.participants] } : undefined;
  }

  join(id: string, userId: string, token: string, now = Date.now()): DebugSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (session.status !== 'active') throw new Error('Session has ended');
    if (token !== session.inviteToken) throw new Error('Invalid invite token');
    if (!session.participants.some((p) => p.id === userId)) {
      session.participants.push({ id: userId, role: 'guest', joinedAt: now });
    }
    return this.get(id) as DebugSession;
  }

  leave(id: string, userId: string): DebugSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (session.hostId === userId) throw new Error('Host must hand off control before leaving');
    session.participants = session.participants.filter((p) => p.id !== userId);
    return this.get(id) as DebugSession;
  }

  /** Transfer host role to an existing participant. */
  handoff(id: string, from: string, to: string): DebugSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (session.hostId !== from) throw new Error('Only the host can hand off control');
    if (!session.participants.some((p) => p.id === to)) throw new Error('Recipient is not a participant');
    session.hostId = to;
    session.participants = session.participants.map((p) => ({
      ...p,
      role: p.id === to ? 'host' : 'guest',
    }));
    return this.get(id) as DebugSession;
  }

  end(id: string, hostId: string): DebugSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (session.hostId !== hostId) throw new Error('Only the host can end a session');
    session.status = 'ended';
    return this.get(id) as DebugSession;
  }
}
