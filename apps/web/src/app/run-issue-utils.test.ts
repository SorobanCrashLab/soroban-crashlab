import * as assert from 'node:assert/strict';
import { RunIssueLink } from './types';
import { validateIssueUrl, getIssueTypeFromUrl, addIssueLink, removeIssueLink } from './run-issue-utils';

const runAssertions = () => {
  // Test validateIssueUrl
  assert.equal(validateIssueUrl('https://github.com/stellar/soroban-cli/issues/123'), true);
  assert.equal(validateIssueUrl('http://jira.company.com/browse/PROJ-123'), true);
  assert.equal(validateIssueUrl('invalid-url'), false);
  assert.equal(validateIssueUrl('ftp://example.com/issue'), false, 'Only http/https should be allowed');

  // Test getIssueTypeFromUrl
  assert.equal(getIssueTypeFromUrl('https://github.com/stellar/soroban-cli/issues/1'), 'GitHub Issue');
  assert.equal(getIssueTypeFromUrl('https://gitlab.com/stellar/issue'), 'GitLab Issue');
  assert.equal(getIssueTypeFromUrl('https://mycompany.jira.com/issue'), 'Jira Ticket');
  assert.equal(getIssueTypeFromUrl('https://linear.app/issue'), 'Linear Issue');
  assert.equal(getIssueTypeFromUrl('https://bugtracker.com/123'), 'External Issue');

  // Test addIssueLink
  const initialLinks: RunIssueLink[] = [{ label: 'Bug 1', href: 'https://github.com/stellar/1' }];
  
  // 1. Successful addition
  const res1 = addIssueLink(initialLinks, { label: 'Bug 2', href: 'https://github.com/stellar/2' });
  assert.equal(res1.success, true);
  assert.equal(res1.links.length, 2);
  assert.equal(res1.links[1].label, 'Bug 2');

  // 2. Edge case: Duplicate addition
  const res2 = addIssueLink(initialLinks, { label: 'Bug 1 Duplicate', href: 'https://github.com/stellar/1' });
  assert.equal(res2.success, false);
  assert.equal(res2.error, 'Issue link already exists');
  assert.equal(res2.links.length, 1);

  // 3. Edge case: Invalid URL
  const res3 = addIssueLink(initialLinks, { label: 'Invalid', href: 'not-a-url' });
  assert.equal(res3.success, false);
  assert.equal(res3.error, 'Invalid URL format');
  assert.equal(res3.links.length, 1);

  // Test removeIssueLink
  const removed = removeIssueLink(res1.links, 0);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].href, 'https://github.com/stellar/2');
};

runAssertions();
console.log('run-issue-utils.test.ts: all assertions passed');
