import * as assert from 'node:assert/strict';

// Mock next/headers for testing in raw node
let mockedHeaders = new Map<string, string>();
const nextHeadersModule = {
  headers: async () => ({
    get: (key: string) => mockedHeaders.get(key) || null,
  }),
};
// Must mock before importing the module that uses it
const modulePath = require.resolve('next/headers');
require.cache[modulePath] = {
  id: modulePath,
  filename: modulePath,
  loaded: true,
  exports: nextHeadersModule
} as any;

import { StructuredLogger } from './structured-logger';

function makeCapture(): { lines: string[]; write: (entry: any) => void } {

  const lines: string[] = [];
  return { lines, write: (entry: any) => lines.push(JSON.stringify(entry)) };
}

async function runTests() {
  // info level: required fields present
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.info('hello world');
    assert.strictEqual(cap.lines.length, 1);
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.level, 'info');
    assert.strictEqual(entry.message, 'hello world');
    assert.ok(typeof entry.timestamp === 'string', 'time must be a string');
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)), 'time must be a valid ISO date');
  }

  // warn level: required fields present
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.warn('watch out');
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.level, 'warn');
    assert.strictEqual(entry.message, 'watch out');
  }

  // error level: required fields present
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.error('something broke');
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.level, 'error');
    assert.strictEqual(entry.message, 'something broke');
  }

  // extra fields are spread into the entry
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.info('request completed', { route: '/api/runs', method: 'GET', status: 200 });
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.route, '/api/runs');
    assert.strictEqual(entry.method, 'GET');
    assert.strictEqual(entry.status, 200);
  }

  // redaction of secrets
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.info('auth', { token: 'secret-123', nested: { password: 'pass', other: 'ok' } });
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.token, '[REDACTED]');
    assert.strictEqual(entry.nested.password, '[REDACTED]');
    assert.strictEqual(entry.nested.other, 'ok');
  }

  // Request-ID propagation
  {
    mockedHeaders.set('x-request-id', 'req-123');
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write);
    await log.info('trace me');
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.requestId, 'req-123');
    mockedHeaders.clear();
  }

  // module tags
  {
    const cap = makeCapture();
    const log = new StructuredLogger(cap.write).withModule('api-routes');
    await log.info('from module');
    const entry = JSON.parse(cap.lines[0]);
    assert.strictEqual(entry.module, 'api-routes');
  }

  console.log('logger.test.ts: all assertions passed');
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
