#!/usr/bin/env node
// Seeds the drill's source KV with record-driver-shaped data (#1900).
const url = process.env.CRASHLAB_BACKUP_SRC_KV_URL;
const token = process.env.CRASHLAB_BACKUP_SRC_KV_TOKEN;

async function pipeline(commands) {
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`seed failed: ${response.status}`);
}

const commands = [['FLUSHDB']];
for (let i = 0; i < 250; i += 1) {
  const key = `rbac:role:github:user${i}`;
  commands.push(['SET', key, JSON.stringify({ id: `role_${i}`, identityType: 'github', identityValue: `user${i}`, role: i % 10 ? 'analyst' : 'maintainer' })]);
  commands.push(['SADD', 'rbac:roles:index', key]);
}
for (let i = 0; i < 600; i += 1) {
  commands.push(['RPUSH', 'rbac:audit', JSON.stringify({ id: `audit_${i}`, outcome: i % 7 ? 'allowed' : 'denied' })]);
}
for (let i = 0; i < 120; i += 1) {
  commands.push(['SET', `api-token:tok${i}`, JSON.stringify({ id: `tok${i}`, scopes: ['runs:read'] })]);
  commands.push(['HSET', `run:run-${i}`, 'status', i % 3 ? 'completed' : 'failed', 'seeds', String(i * 100)]);
  commands.push(['ZADD', 'runs:by-time', String(1_760_000_000 + i), `run-${i}`]);
}
// Short-lived keys keep their TTL across restore.
commands.push(['SET', 'session:drill', 'ephemeral', 'EX', '86400']);

for (let i = 0; i < commands.length; i += 500) await pipeline(commands.slice(i, i + 500));
console.log(`seeded ${commands.length - 1} writes`);
