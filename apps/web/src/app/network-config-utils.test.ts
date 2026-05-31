import * as assert from 'node:assert/strict';
import {
  createDefaultNetworkStore,
  serializeNetworkStore,
  readNetworkStore,
  validateNetworkUrl,
  validateNetworkConfig,
  validateNetworkStore,
  addNetwork,
  removeNetwork,
  switchActiveNetwork,
  findNetworkById,
  type NetworkConfig,
} from './network-config-utils';

const referenceTime = new Date('2026-05-31T12:00:00.000Z');

function testDefaultStoreShape(): void {
  const store = createDefaultNetworkStore(referenceTime);

  assert.equal(store.networks.length, 3);
  assert.ok(store.networks.every((n) => n.isBuiltIn));
  assert.equal(store.activeNetworkId, 'testnet');
  assert.ok(!Number.isNaN(Date.parse(store.lastUpdated)));
}

function testRoundTrip(): void {
  const store = createDefaultNetworkStore(referenceTime);
  const serialized = serializeNetworkStore(store);
  const result = readNetworkStore(serialized, referenceTime);

  assert.equal(result.status, 'success');
  assert.ok(result.snapshot);
  assert.equal(result.snapshot?.networks.length, store.networks.length);
}

function testNullInput(): void {
  const result = readNetworkStore(null, referenceTime);

  assert.equal(result.status, 'success');
  assert.ok(result.snapshot);
  assert.equal(result.snapshot?.networks.length, 3);
  assert.equal(result.snapshot?.activeNetworkId, 'testnet');
}

function testInvalidJsonInput(): void {
  const result = readNetworkStore('not json', referenceTime);

  assert.equal(result.status, 'error');
  assert.match(result.error ?? '', /valid JSON/i);
}

function testBuiltInMerge(): void {
  // Store with only 1 built-in network
  const partialStore = {
    networks: [
      {
        id: 'testnet',
        name: 'Stellar Testnet',
        networkPassphrase: 'Test SDF Network ; September 2015',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        friendbotUrl: 'https://friendbot.stellar.org',
        isBuiltIn: true,
        addedAt: '2015-10-13T00:00:00.000Z',
      },
    ],
    activeNetworkId: 'testnet',
    lastUpdated: referenceTime.toISOString(),
  };

  const serialized = JSON.stringify(partialStore);
  const result = readNetworkStore(serialized, referenceTime);

  assert.equal(result.status, 'success');
  assert.equal(result.snapshot?.networks.length, 3);
}

function testUrlValidation(): void {
  // empty string → required error
  assert.ok(validateNetworkUrl('', 'Horizon URL') !== null);
  assert.match(validateNetworkUrl('', 'Horizon URL') ?? '', /required/i);

  // non-url string → not a valid URL
  assert.ok(validateNetworkUrl('not-a-url', 'Horizon URL') !== null);
  assert.match(validateNetworkUrl('not-a-url', 'Horizon URL') ?? '', /not a valid URL/i);

  // http://example.com → must use HTTPS
  assert.ok(validateNetworkUrl('http://example.com', 'Horizon URL') !== null);
  assert.match(validateNetworkUrl('http://example.com', 'Horizon URL') ?? '', /HTTPS/i);

  // http://localhost:8000 → pass (null)
  assert.equal(validateNetworkUrl('http://localhost:8000', 'Horizon URL'), null);

  // http://127.0.0.1:8545 → pass (null)
  assert.equal(validateNetworkUrl('http://127.0.0.1:8545', 'Horizon URL'), null);

  // https://example.com → pass (null)
  assert.equal(validateNetworkUrl('https://example.com', 'Horizon URL'), null);

  // ftp://example.com → must use HTTPS
  assert.ok(validateNetworkUrl('ftp://example.com', 'Horizon URL') !== null);
  assert.match(validateNetworkUrl('ftp://example.com', 'Horizon URL') ?? '', /HTTPS/i);
}

function testNameValidation(): void {
  const baseConfig: NetworkConfig = {
    id: 'custom-net',
    name: 'My Network',
    networkPassphrase: 'My Network Passphrase',
    horizonUrl: 'https://horizon.example.com',
    rpcUrl: 'https://rpc.example.com',
    isBuiltIn: false,
    addedAt: referenceTime.toISOString(),
  };

  // empty name → fail
  const emptyName = validateNetworkConfig({ ...baseConfig, name: '' });
  assert.ok(emptyName !== null);
  assert.match(emptyName ?? '', /required/i);

  // 65-char name → fail
  const longName = validateNetworkConfig({ ...baseConfig, name: 'a'.repeat(65) });
  assert.ok(longName !== null);
  assert.match(longName ?? '', /64/i);

  // name with leading space → fail
  const leadingSpace = validateNetworkConfig({ ...baseConfig, name: ' My Network' });
  assert.ok(leadingSpace !== null);
  assert.match(leadingSpace ?? '', /whitespace/i);

  // 64-char name → pass
  const exactLength = validateNetworkConfig({ ...baseConfig, name: 'a'.repeat(64) });
  assert.equal(exactLength, null);

  // empty passphrase → fail
  const emptyPassphrase = validateNetworkConfig({ ...baseConfig, networkPassphrase: '' });
  assert.ok(emptyPassphrase !== null);
  assert.match(emptyPassphrase ?? '', /passphrase/i);
}

function testDuplicateCheck(): void {
  const store = createDefaultNetworkStore(referenceTime);

  const baseConfig: NetworkConfig = {
    id: 'custom-net',
    name: 'Unique Network',
    networkPassphrase: 'Custom Passphrase',
    horizonUrl: 'https://custom-horizon.example.com',
    rpcUrl: 'https://custom-rpc.example.com',
    isBuiltIn: false,
    addedAt: referenceTime.toISOString(),
  };

  // same name as testnet → fail
  const sameName = validateNetworkStore(store, { ...baseConfig, name: 'Stellar Testnet' });
  assert.ok(sameName !== null);
  assert.match(sameName ?? '', /already exists/i);

  // same horizonUrl as testnet → fail
  const sameHorizonUrl = validateNetworkStore(store, {
    ...baseConfig,
    horizonUrl: 'https://horizon-testnet.stellar.org',
  });
  assert.ok(sameHorizonUrl !== null);
  assert.match(sameHorizonUrl ?? '', /already exists/i);

  // unique network → pass
  const uniqueNetwork = validateNetworkStore(store, baseConfig);
  assert.equal(uniqueNetwork, null);
}

function testMutations(): void {
  const store = createDefaultNetworkStore(referenceTime);

  const newNetwork: NetworkConfig = {
    id: 'custom-net',
    name: 'Custom Network',
    networkPassphrase: 'Custom Passphrase',
    horizonUrl: 'https://custom-horizon.example.com',
    rpcUrl: 'https://custom-rpc.example.com',
    isBuiltIn: false,
    addedAt: referenceTime.toISOString(),
  };

  // addNetwork
  const storeWithNew = addNetwork(store, newNetwork);
  assert.equal(storeWithNew.networks.length, 4);
  assert.ok(storeWithNew.networks.some((n) => n.id === 'custom-net'));
  // original store unmodified
  assert.equal(store.networks.length, 3);

  // removeNetwork
  const storeAfterRemove = removeNetwork(storeWithNew, 'custom-net');
  assert.equal(storeAfterRemove.networks.length, 3);
  assert.ok(!storeAfterRemove.networks.some((n) => n.id === 'custom-net'));

  // switchActiveNetwork
  const storeWithMainnet = switchActiveNetwork(store, 'mainnet');
  assert.equal(storeWithMainnet.activeNetworkId, 'mainnet');
  assert.equal(store.activeNetworkId, 'testnet');

  // findNetworkById
  const found = findNetworkById(store, 'testnet');
  assert.ok(found !== undefined);
  assert.equal(found?.id, 'testnet');

  const notFound = findNetworkById(store, 'does-not-exist');
  assert.equal(notFound, undefined);
}

testDefaultStoreShape();
testRoundTrip();
testNullInput();
testInvalidJsonInput();
testBuiltInMerge();
testUrlValidation();
testNameValidation();
testDuplicateCheck();
testMutations();

console.log('network-config-utils.test.ts: all assertions passed');
