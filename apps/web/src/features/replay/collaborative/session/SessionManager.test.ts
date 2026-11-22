/** Session lifecycle, invites and RBAC tests (#2205). */
import { describe, expect, it } from 'vitest';
import { SessionManager, inviteToken } from './session';

describe('session manager', () => {
  const setup = (manager: SessionManager) => manager.create('s1', 'run_abc123', 'alice', 1000);

  it('creates a session with a host and a deterministic invite', () => {
    const manager = new SessionManager();
    const session = setup(manager);
    expect(session.hostId).toBe('alice');
    expect(session.participants).toHaveLength(1);
    expect(session.inviteToken).toBe(inviteToken('s1', 'run_abc123'));
  });

  it('joins with a valid invite and rejects a bad token', () => {
    const manager = new SessionManager();
    const session = setup(manager);
    expect(() => manager.join('s1', 'bob', 'wrong')).toThrow(/Invalid invite/);
    const joined = manager.join('s1', 'bob', session.inviteToken, 2000);
    expect(joined.participants.map((p) => p.id)).toEqual(['alice', 'bob']);
    manager.join('s1', 'bob', session.inviteToken, 3000);
    expect(manager.get('s1')?.participants).toHaveLength(2);
  });

  it('handoffs control and then lets the former host leave', () => {
    const manager = new SessionManager();
    const session = setup(manager);
    manager.join('s1', 'bob', session.inviteToken);
    expect(() => manager.leave('s1', 'alice')).toThrow(/hand off/);
    expect(() => manager.handoff('s1', 'bob', 'alice')).toThrow(/Only the host/);
    expect(manager.handoff('s1', 'alice', 'bob').hostId).toBe('bob');
    expect(manager.get('s1')?.participants.find((p) => p.id === 'bob')?.role).toBe('host');
    expect(manager.leave('s1', 'alice').participants.map((p) => p.id)).toEqual(['bob']);
  });

  it('ends a session only by host request', () => {
    const manager = new SessionManager();
    setup(manager);
    expect(() => manager.end('s1', 'bob')).toThrow(/Only the host/);
    expect(manager.end('s1', 'alice').status).toBe('ended');
  });
});
