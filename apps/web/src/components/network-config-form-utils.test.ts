import * as assert from 'node:assert/strict';
import { getNetworkFieldError } from './network-config-form-utils';

// name
assert.equal(getNetworkFieldError('name', ''), 'Name is required.');
assert.equal(getNetworkFieldError('name', '   '), 'Name is required.');
assert.equal(getNetworkFieldError('name', 'My Network'), null);
assert.equal(
  getNetworkFieldError('name', 'a'.repeat(65)),
  'Name must be 64 characters or fewer.',
);
assert.equal(
  getNetworkFieldError('name', ' My Network'),
  'Name must not have leading or trailing whitespace.',
);

// networkPassphrase
assert.equal(
  getNetworkFieldError('networkPassphrase', ''),
  'Network passphrase is required.',
);
assert.equal(
  getNetworkFieldError('networkPassphrase', 'Test SDF Network ; September 2015'),
  null,
);

// horizonUrl
assert.equal(getNetworkFieldError('horizonUrl', ''), 'Horizon URL is required.');
assert.equal(
  getNetworkFieldError('horizonUrl', 'not a url'),
  'Horizon URL is not a valid URL.',
);
assert.equal(
  getNetworkFieldError('horizonUrl', 'https://horizon-testnet.stellar.org'),
  null,
);

// rpcUrl — this is the core bug from issue #1084: the form must reject
// malformed RPC URLs on blur, using the same rules already enforced
// server-side by validateNetworkUrl().
assert.equal(getNetworkFieldError('rpcUrl', ''), 'RPC URL is required.');
assert.equal(
  getNetworkFieldError('rpcUrl', 'not-a-url'),
  'RPC URL is not a valid URL.',
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'ftp://example.com/rpc'),
  'RPC URL must use HTTP or HTTPS protocol.',
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'http://example.com/rpc'),
  'RPC URL must use HTTPS (HTTP is only allowed for localhost).',
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'http://localhost:8000/rpc'),
  null,
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'https://soroban-testnet.stellar.org'),
  null,
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'https://mainnet.stellar.validationcloud.io/v1/xycxyc'),
  null,
);
assert.equal(
  getNetworkFieldError('rpcUrl', 'https://example.com/unexpected-path'),
  'RPC URL must have a valid path format (e.g., /, /v1/key, /rpc).',
);

// friendbotUrl — optional
assert.equal(getNetworkFieldError('friendbotUrl', ''), null);
assert.equal(
  getNetworkFieldError('friendbotUrl', 'not a url'),
  'Friendbot URL is not a valid URL.',
);
assert.equal(
  getNetworkFieldError('friendbotUrl', 'https://friendbot.stellar.org'),
  null,
);

console.log('network-config-form-utils.test.ts: all assertions passed');
