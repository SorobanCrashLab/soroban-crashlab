/** Shared replay and annotation tests (#2205). */
import { describe, expect, it } from 'vitest';
import { SharedReplayController } from './replay';
import { AnnotationStore } from '../annotations/annotations';

describe('shared replay controller', () => {
  it('restricts changes to the controller', () => {
    const controller = new SharedReplayController('alice', 100);
    expect(() => controller.seek('bob', 10)).toThrow(/Only the controller/);
    expect(controller.seek('alice', 10).frame).toBe(10);
    expect(() => controller.seek('alice', 101)).toThrow(/out of range/);
    expect(() => controller.setRate('alice', 3)).toThrow(/Unsupported/);
  });

  it('supports control requests and handoff', () => {
    const controller = new SharedReplayController('alice', 100);
    expect(controller.requestControl('bob').controlRequest).toBe('bob');
    expect(controller.grantControl('alice', 'bob').controllerId).toBe('bob');
    expect(controller.snapshot().controlRequest).toBeUndefined();
    expect(controller.play('bob').playing).toBe(true);
  });

  it('ticks playback and stops at the end', () => {
    const controller = new SharedReplayController('alice', 10);
    controller.play('alice');
    expect(controller.tick(4).frame).toBe(4);
    expect(controller.tick(20).frame).toBe(10);
    expect(controller.snapshot().playing).toBe(false);
  });
});

describe('annotation store', () => {
  it('persists annotations, replies and ordering', () => {
    const store = new AnnotationStore();
    store.add({ sessionId: 's1', author: 'sarah', frame: 12, text: 'Look here' }, 100);
    store.add({ sessionId: 's1', author: 'mike', frame: 5, text: 'Earlier' }, 200);
    expect(store.list('s1').map((a) => a.frame)).toEqual([5, 12]);
    const first = store.list('s1')[1];
    expect(store.reply(first.id, 'you', 'Confirmed', 300).replies).toHaveLength(1);
    expect(store.atFrame('s1', 12)[0].replies[0].text).toBe('Confirmed');
    expect(store.list('other')).toEqual([]);
  });
});
