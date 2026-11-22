import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryRecordDriver,
  RedisRecordDriver,
  readPositiveIntegerEnv,
  type RecordRedisClient,
} from './record-driver';

/**
 * Minimal in-process stand-in for the Upstash list/set verbs, so the Redis
 * driver is held to the same statements the in-memory driver passes.
 */
function createFakeRedis() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();

  const client: RecordRedisClient = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      return 'OK';
    },
    async del(key) {
      values.delete(key);
      sets.delete(key);
      lists.delete(key);
      return 1;
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
      return 1;
    },
    async srem(key, member) {
      return sets.get(key)?.delete(member) ? 1 : 0;
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async rpush(key, member) {
      const list = lists.get(key) ?? [];
      list.push(member);
      lists.set(key, list);
      return list.length;
    },
    async lrange(key, start, stop) {
      const list = lists.get(key) ?? [];
      const from = start < 0 ? Math.max(list.length + start, 0) : start;
      const to = stop < 0 ? list.length + stop : stop;
      return list.slice(from, to + 1);
    },
    async llen(key) {
      return lists.get(key)?.length ?? 0;
    },
    async ltrim(key, start, stop) {
      const list = lists.get(key) ?? [];
      const from = start < 0 ? Math.max(list.length + start, 0) : start;
      const to = stop < 0 ? list.length + stop : stop;
      lists.set(key, list.slice(from, to + 1));
      return 'OK';
    },
  };

  return client;
}

const drivers = [
  { name: 'in-memory', create: () => new InMemoryRecordDriver() },
  { name: 'redis', create: () => new RedisRecordDriver(createFakeRedis()) },
];

describe.each(drivers)('RecordDriver: $name', ({ create }) => {
  let driver: InMemoryRecordDriver | RedisRecordDriver;

  beforeEach(() => {
    driver = create();
  });

  it('round-trips a record and reports absence', async () => {
    expect(await driver.getRecord('missing')).toBeNull();
    await driver.putRecord('present', 'value');
    expect(await driver.getRecord('present')).toBe('value');
  });

  it('deletes a record and reports whether it existed', async () => {
    await driver.putRecord('gone', 'value');
    expect(await driver.deleteRecord('gone')).toBe(true);
    expect(await driver.getRecord('gone')).toBeNull();
  });

  it('enumerates an index and drops members from it', async () => {
    await driver.addToIndex('idx', 'a');
    await driver.addToIndex('idx', 'b');
    expect((await driver.listIndex('idx')).sort()).toEqual(['a', 'b']);

    await driver.removeFromIndex('idx', 'a');
    expect(await driver.listIndex('idx')).toEqual(['b']);
  });

  it('clears an index wholesale', async () => {
    await driver.addToIndex('idx', 'a');
    await driver.clearIndex('idx');
    expect(await driver.listIndex('idx')).toEqual([]);
  });

  it('reads appended entries newest first', async () => {
    await driver.appendEntry('log', 'one', 10);
    await driver.appendEntry('log', 'two', 10);
    expect(await driver.listEntries('log', 10)).toEqual(['two', 'one']);
  });

  it('honours a read limit', async () => {
    for (const value of ['a', 'b', 'c']) {
      await driver.appendEntry('log', value, 10);
    }
    expect(await driver.listEntries('log', 2)).toEqual(['c', 'b']);
  });

  it('caps retained entries by dropping the oldest', async () => {
    for (const value of ['a', 'b', 'c', 'd']) {
      await driver.appendEntry('log', value, 3);
    }
    expect(await driver.listEntries('log', 10)).toEqual(['d', 'c', 'b']);
    expect(await driver.countEntries('log')).toBe(3);
  });

  it('trims to a requested size and can empty a log entirely', async () => {
    for (const value of ['a', 'b', 'c']) {
      await driver.appendEntry('log', value, 10);
    }

    await driver.trimEntries('log', 1);
    expect(await driver.listEntries('log', 10)).toEqual(['c']);

    await driver.trimEntries('log', 0);
    expect(await driver.countEntries('log')).toBe(0);
  });
});

describe('readPositiveIntegerEnv', () => {
  const original = process.env.CRASHLAB_TEST_RETENTION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CRASHLAB_TEST_RETENTION;
    } else {
      process.env.CRASHLAB_TEST_RETENTION = original;
    }
  });

  it('falls back when unset, blank or nonsensical', () => {
    delete process.env.CRASHLAB_TEST_RETENTION;
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(7);

    process.env.CRASHLAB_TEST_RETENTION = '   ';
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(7);

    process.env.CRASHLAB_TEST_RETENTION = 'not-a-number';
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(7);

    // A zero or negative retention would silently discard the whole log.
    process.env.CRASHLAB_TEST_RETENTION = '0';
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(7);

    process.env.CRASHLAB_TEST_RETENTION = '-3';
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(7);
  });

  it('reads a configured positive integer', () => {
    process.env.CRASHLAB_TEST_RETENTION = '42';
    expect(readPositiveIntegerEnv('CRASHLAB_TEST_RETENTION', 7)).toBe(42);
  });
});
