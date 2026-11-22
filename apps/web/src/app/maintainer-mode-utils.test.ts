import * as assert from 'node:assert/strict';
import {
  isQuotaExceededError,
  MAINTAINER_STORAGE_KEY,
  parseMaintainerStored,
} from './maintainer-mode-utils';

// MAINTAINER_STORAGE_KEY
assert.equal(MAINTAINER_STORAGE_KEY, 'crashlab:maintainer-mode');

// parseMaintainerStored
assert.equal(parseMaintainerStored('true'), true);
assert.equal(parseMaintainerStored('false'), false);
assert.equal(parseMaintainerStored(null), false);
assert.equal(parseMaintainerStored(''), false);
assert.equal(parseMaintainerStored('TRUE'), false);   // case-sensitive
assert.equal(parseMaintainerStored('1'), false);

// isQuotaExceededError — non-DOMException values
assert.equal(isQuotaExceededError(null), false);
assert.equal(isQuotaExceededError(undefined), false);
assert.equal(isQuotaExceededError('string error'), false);
assert.equal(isQuotaExceededError(new Error('generic')), false);
assert.equal(isQuotaExceededError(42), false);

// isQuotaExceededError — DOMException by name
const quotaByName = new DOMException('full', 'QuotaExceededError');
assert.equal(isQuotaExceededError(quotaByName), true);

const nsQuota = new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED');
assert.equal(isQuotaExceededError(nsQuota), true);

// isQuotaExceededError — unrelated DOMException
const notFound = new DOMException('not found', 'NotFoundError');
assert.equal(isQuotaExceededError(notFound), false);

// isQuotaExceededError — DOMException by legacy code
// code 22 = QuotaExceededError in legacy browsers
const byCode22 = Object.assign(new DOMException('full'), { code: 22 });
assert.equal(isQuotaExceededError(byCode22), true);

const byCode1014 = Object.assign(new DOMException('full'), { code: 1014 });
assert.equal(isQuotaExceededError(byCode1014), true);

console.log('maintainer-mode-utils.test.ts: all assertions passed');
