import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { WebhookStore, resetWebhookStore } from '../lib/webhook-store';
import { WebhookDeliveryWorker, WebhookDeliveryRequest } from '../lib/webhook-delivery-worker';

const TEST_DATA_DIR = path.join(__dirname, '__test-webhook-data__');

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

function makeRequest(id: string): WebhookDeliveryRequest {
  return {
    id,
    url: 'https://example.com/deliver',
    eventType: 'run.completed',
    payload: { runId: id },
  };
}

// ─── WebhookStore: config persistence ──────────────────────────────────

cleanup();
resetWebhookStore();

{
  const dir = path.join(TEST_DATA_DIR, 'configs1');
  const store1 = new WebhookStore(dir);
  store1.setConfig({
    id: 'wh-1',
    url: 'https://example.com/hook',
    events: ['run.completed'],
    active: true,
  });

  const store2 = new WebhookStore(dir);
  const cfg = store2.getConfig('wh-1');
  assert.ok(cfg, 'config should exist');
  assert.strictEqual(cfg.url, 'https://example.com/hook');
  console.log('PASS: persists configs across instances');
}

{
  const dir = path.join(TEST_DATA_DIR, 'configs2');
  const store1 = new WebhookStore(dir);
  store1.setConfig({
    id: 'wh-1',
    url: 'https://example.com/hook',
    events: ['run.completed'],
    active: true,
  });
  store1.deleteConfig('wh-1');

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.getConfig('wh-1'), undefined);
  assert.strictEqual(store2.getAllConfigs().length, 0);
  console.log('PASS: persists config deletion');
}

{
  const dir = path.join(TEST_DATA_DIR, 'configs3');
  const store = new WebhookStore(dir);
  store.setConfig({ id: 'a', url: 'https://a.com', events: ['run.started'], active: true });
  store.setConfig({ id: 'b', url: 'https://b.com', events: ['run.failed'], active: false });

  assert.strictEqual(store.getAllConfigs().length, 2);
  console.log('PASS: returns all configs');
}

// ─── WebhookStore: queue persistence ───────────────────────────────────

{
  const dir = path.join(TEST_DATA_DIR, 'queue1');
  const store1 = new WebhookStore(dir);
  store1.enqueue(makeRequest('req-1'));
  store1.enqueue(makeRequest('req-2'));

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.queueSize(), 2);
  assert.strictEqual(store2.getQueue()[0].id, 'req-1');
  console.log('PASS: persists queue across instances');
}

{
  const dir = path.join(TEST_DATA_DIR, 'queue2');
  const store1 = new WebhookStore(dir);
  store1.enqueue(makeRequest('req-1'));
  store1.enqueue(makeRequest('req-2'));
  store1.dequeue();

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.queueSize(), 1);
  assert.strictEqual(store2.getQueue()[0].id, 'req-2');
  console.log('PASS: persists dequeue');
}

{
  const dir = path.join(TEST_DATA_DIR, 'queue3');
  const store1 = new WebhookStore(dir);
  store1.enqueue(makeRequest('req-1'));
  store1.enqueue(makeRequest('req-2'));
  store1.removeFromQueue('req-1');

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.queueSize(), 1);
  assert.strictEqual(store2.getQueue()[0].id, 'req-2');
  console.log('PASS: persists removeFromQueue');
}

{
  const dir = path.join(TEST_DATA_DIR, 'queue4');
  const store1 = new WebhookStore(dir);
  store1.enqueue(makeRequest('req-1'));
  store1.enqueue(makeRequest('req-2'));
  store1.clearQueue();

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.queueSize(), 0);
  console.log('PASS: persists clearQueue');
}

// ─── WebhookStore: delivery log persistence ────────────────────────────

{
  const dir = path.join(TEST_DATA_DIR, 'log1');
  const store1 = new WebhookStore(dir);
  store1.addDeliveryLog({
    webhookId: 'wh-1',
    success: true,
    statusCode: 200,
    retryCount: 0,
    timestamp: new Date().toISOString(),
  });

  const store2 = new WebhookStore(dir);
  const log = store2.getDeliveryLog();
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].webhookId, 'wh-1');
  console.log('PASS: persists delivery log across instances');
}

{
  const dir = path.join(TEST_DATA_DIR, 'log2');
  const store = new WebhookStore(dir);
  store.addDeliveryLog({ webhookId: 'wh-1', success: true, retryCount: 0, timestamp: '' });
  store.addDeliveryLog({ webhookId: 'wh-2', success: false, retryCount: 1, timestamp: '' });

  assert.strictEqual(store.getDeliveryLog('wh-1').length, 1);
  assert.strictEqual(store.getDeliveryLog('wh-2').length, 1);
  console.log('PASS: filters delivery log by webhook ID');
}

{
  const dir = path.join(TEST_DATA_DIR, 'log3');
  const store1 = new WebhookStore(dir);
  store1.addDeliveryLog({ webhookId: 'wh-1', success: true, retryCount: 0, timestamp: '' });
  store1.clearDeliveryLog();

  const store2 = new WebhookStore(dir);
  assert.strictEqual(store2.getDeliveryLog().length, 0);
  console.log('PASS: persists clearDeliveryLog');
}

// ─── WebhookDeliveryWorker: restart recovery (sync) ────────────────────

{
  const dir = path.join(TEST_DATA_DIR, 'recover1');
  const store = new WebhookStore(dir);
  store.enqueue(makeRequest('req-1'));
  store.enqueue(makeRequest('req-2'));

  const worker = new WebhookDeliveryWorker({ store });
  assert.strictEqual(worker.size(), 0);

  worker.recoverPendingDeliveries();
  assert.strictEqual(worker.size(), 2);
  console.log('PASS: recovers pending deliveries from the store');
}

{
  const dir = path.join(TEST_DATA_DIR, 'recover2');
  const store = new WebhookStore(dir);
  store.enqueue(makeRequest('req-1'));

  const worker = new WebhookDeliveryWorker({ store });
  worker.recoverPendingDeliveries();
  worker.recoverPendingDeliveries();
  assert.strictEqual(worker.size(), 1);
  console.log('PASS: does not duplicate already-recovered items');
}

{
  const worker = new WebhookDeliveryWorker();
  worker.enqueue(makeRequest('req-1'));
  assert.strictEqual(worker.size(), 1);
  worker.start();
  worker.stop();
  console.log('PASS: works without a store (backward compatible)');
}

// ─── WebhookDeliveryWorker: restart recovery (async) ───────────────────

void (async () => {
  {
    const dir = path.join(TEST_DATA_DIR, 'recover3');
    const store = new WebhookStore(dir);
    store.enqueue(makeRequest('req-1'));

    let delivered = false;
    const worker = new WebhookDeliveryWorker({
      store,
      adapter: {
        deliver: async () => {
          delivered = true;
          return { ok: true, statusCode: 200 };
        },
      },
      delay: async () => {},
    });

    worker.start();
    await worker.drain();
    worker.stop();

    assert.strictEqual(delivered, true);
    assert.strictEqual(store.queueSize(), 0);
    assert.strictEqual(store.getDeliveryLog().length, 1);
    console.log('PASS: removes items from persistent store after processing');
  }

  {
    const dir = path.join(TEST_DATA_DIR, 'recover4');
    const store = new WebhookStore(dir);
    store.enqueue(makeRequest('req-1'));
    store.enqueue(makeRequest('req-2'));
    store.enqueue(makeRequest('req-3'));

    // Simulate: req-1 was already processed before the "crash"
    store.removeFromQueue('req-1');

    // New worker instance (simulates restart)
    const worker = new WebhookDeliveryWorker({ store });
    worker.recoverPendingDeliveries();
    assert.strictEqual(worker.size(), 2);
    assert.strictEqual(store.getQueue()[0].id, 'req-2');
    assert.strictEqual(store.getQueue()[1].id, 'req-3');
    console.log('PASS: survives simulated restart with partial queue');
  }

  cleanup();
  resetWebhookStore();
  console.log('ALL webhook-store tests passed');
})();

// ─── WebhookStore: signing-secret rotation matrix (#1663) ──────────────
//
// rotate → outbound signing uses the new key → old accepted in grace window
// → rejected after expiry → revoke-grace terminates the window early. Secret
// records persist across restarts and seed from env on first boot only.

function withEnvSecrets(env: Record<string, string>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

withEnvSecrets(
  {
    CRASHLAB_WEBHOOK_SIGNING_SECRETS: 'older-secret,newer-secret',
    CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS: '7',
  },
  () => {
    const dir = path.join(TEST_DATA_DIR, 'signing1');
    const store = new WebhookStore(dir);

    // Seeding: first env secret is active, the rest are grace records.
    const seeded = store.listSigningSecretRecords();
    assert.strictEqual(seeded.length, 2, 'seeds one record per env secret');
    const active = store.getActiveSigningSecretRecord();
    assert.ok(active, 'seeding produces an active secret');
    assert.strictEqual(active.secret, 'older-secret');
    assert.strictEqual(
      store.getSigningSecretsForVerification()[0],
      'older-secret',
      'active secret is verified first',
    );
    assert.deepStrictEqual(
      store.getSigningSecretsForVerification().sort(),
      ['newer-secret', 'older-secret'],
      'verification accepts active + grace secrets',
    );
    console.log('PASS: seeds signing-secret records from env (active + grace)');
  },
);

withEnvSecrets(
  {
    CRASHLAB_WEBHOOK_SIGNING_SECRETS: 'old-secret',
    CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS: '2',
  },
  () => {
    const dir = path.join(TEST_DATA_DIR, 'signing2');
    const store = new WebhookStore(dir);

    const { active, previousKeyId } = store.rotateSigningSecret();

    // The new secret is the active signer; the old one is in grace.
    assert.notStrictEqual(active.secret, 'old-secret');
    assert.strictEqual(active.status, 'active');
    assert.strictEqual(previousKeyId, store.listSigningSecretRecords()[1].keyId);
    assert.strictEqual(store.getActiveSigningSecretRecord()?.secret, active.secret, 'rotation swaps the active secret');
    const grace = store.listSigningSecretRecords().find((record) => record.status === 'grace');
    assert.ok(grace?.expiresAt, 'demoted secret gets an expiry');

    // Matrix: signing uses the new key; verification still accepts the old one
    // inside the window; after expiry only the new key verifies.
    assert.strictEqual(store.getSigningSecretsForVerification()[0], active.secret, 'deliveries sign with the new key');
    assert.ok(
      store.getSigningSecretsForVerification().includes('old-secret'),
      'old secret accepted inside the grace window',
    );

    const pruned = store.pruneExpiredSigningSecrets(Date.now() + 3 * 24 * 60 * 60 * 1000);
    assert.strictEqual(pruned, 1, 'expired grace secret is pruned');
    assert.ok(
      !store.getSigningSecretsForVerification().includes('old-secret'),
      'old secret rejected after its grace window lapses',
    );

    // Cleanup: rotate again so the remaining expiry math is irrelevant, then
    // verify that the file persisted records survive a restart.
    console.log('PASS: rotation matrix — sign new, accept old in window, reject after expiry');
  },
);

withEnvSecrets(
  {
    CRASHLAB_WEBHOOK_SIGNING_SECRETS: 'old-secret,grace-secret',
    CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS: '7',
  },
  () => {
    const dir = path.join(TEST_DATA_DIR, 'signing3');
    const store = new WebhookStore(dir);

    const graceRecord = store.listSigningSecretRecords().find((record) => record.status === 'grace');
    assert.ok(graceRecord, 'a grace record exists to revoke');

    const revoked = store.revokeGraceSigningSecret(graceRecord.keyId);
    assert.strictEqual(revoked, true);
    assert.ok(
      !store.listSigningSecretRecords().some((record) => record.status === 'grace'),
      'revoke-grace removes the grace record immediately',
    );
    assert.ok(!store.getSigningSecretsForVerification().includes('grace-secret'), 'revoked secret is no longer accepted');

    const missing = store.revokeGraceSigningSecret('key-does-not-exist');
    assert.strictEqual(missing, false, 'revoking an unknown key reports false');

    // The active secret cannot be revoked through the grace path.
    const again = store.revokeGraceSigningSecret(store.getActiveSigningSecretRecord()!.keyId);
    assert.strictEqual(again, false, 'active secrets are never touched by revoke-grace');
    console.log('PASS: revoke-grace terminates a grace window immediately');
  },
);

withEnvSecrets(
  {
    CRASHLAB_WEBHOOK_SIGNING_SECRETS: 'persist-me',
    CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS: '5',
  },
  () => {
    const dir = path.join(TEST_DATA_DIR, 'signing4');
    const store = new WebhookStore(dir);
    store.rotateSigningSecret();
    const rotatedKeyId = store.getActiveSigningSecretRecord()!.keyId;

    const reloaded = new WebhookStore(dir);
    assert.strictEqual(reloaded.listSigningSecretRecords().length, 2, 'secret records survive a restart');
    assert.strictEqual(
      reloaded.getActiveSigningSecretRecord()!.keyId,
      rotatedKeyId,
      'the rotated active secret survives the restart',
    );
    assert.strictEqual(
      reloaded.getSigningSecretsForVerification()[0],
      reloaded.getActiveSigningSecretRecord()!.secret,
      'active-first ordering is restored after reload',
    );
    console.log('PASS: signing-secret records persist across restarts');
  },
);

withEnvSecrets(
  {
    CRASHLAB_WEBHOOK_SIGNING_SECRETS: 'old-env,grace-env',
  },
  () => {
    const dir = path.join(TEST_DATA_DIR, 'signing5');
    const store = new WebhookStore(dir);

    const worker = new WebhookDeliveryWorker({ store });
    assert.deepStrictEqual(
      worker.getHmacSecrets().sort(),
      ['old-env', 'grace-env'].sort(),
      'delivery worker draws its ring from the store records',
    );
    assert.strictEqual(worker.getHmacSecrets()[0], 'old-env', 'active secret signs outbound');

    console.log('PASS: delivery worker signs with the store active secret');
  },
);
