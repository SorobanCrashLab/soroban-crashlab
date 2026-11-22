import * as assert from 'node:assert/strict';

// Test the pagination reset logic in isolation.
// These tests verify that when filter_tag changes, the page param is removed
// from the URL, and that page navigation works correctly.

// Simulate the URL manipulation logic from page.tsx setActiveTag
function simulateSetActiveTag(
  searchParamsStr: string,
  tag: string,
): string {
  const params = new URLSearchParams(searchParamsStr);
  if (!tag || tag === 'all') {
    params.delete('filter_tag');
  } else {
    params.set('filter_tag', tag);
  }
  params.delete('page');
  return params.toString();
}

// Simulate the URL manipulation logic from page.tsx handlePageChange
function simulateHandlePageChange(
  searchParamsStr: string,
  page: number,
): string {
  const params = new URLSearchParams(searchParamsStr);
  if (page <= 1) {
    params.delete('page');
  } else {
    params.set('page', String(page));
  }
  return params.toString();
}

// --- setActiveTag resets page ---

// Changing filter_tag removes page param
{
  const result = simulateSetActiveTag('page=3', 'auth');
  assert.equal(result, 'filter_tag=auth', 'page=3 should be removed when filter_tag changes');
  console.log('PASS: setActiveTag removes page param');
}

// Changing filter_tag removes page even with other params
{
  const result = simulateSetActiveTag('page=5&status=running', 'auth');
  assert.ok(!result.includes('page='), 'page should be removed');
  assert.ok(result.includes('filter_tag=auth'), 'filter_tag should be set');
  assert.ok(result.includes('status=running'), 'other params preserved');
  console.log('PASS: setActiveTag preserves other params while removing page');
}

// Setting tag to "all" removes both filter_tag and page
{
  const result = simulateSetActiveTag('filter_tag=auth&page=2', 'all');
  assert.ok(!result.includes('filter_tag='), 'filter_tag should be removed for "all"');
  assert.ok(!result.includes('page='), 'page should be removed');
  console.log('PASS: setActiveTag("all") removes filter_tag and page');
}

// Setting tag to empty string removes both filter_tag and page
{
  const result = simulateSetActiveTag('filter_tag=auth&page=2', '');
  assert.ok(!result.includes('filter_tag='), 'filter_tag should be removed');
  assert.ok(!result.includes('page='), 'page should be removed');
  console.log('PASS: setActiveTag("") removes filter_tag and page');
}

// No page param to begin with — no error
{
  const result = simulateSetActiveTag('filter_tag=auth', 'severity');
  assert.equal(result, 'filter_tag=severity');
  console.log('PASS: setActiveTag works when no page param exists');
}

// --- handlePageChange ---

// Page 1 removes the page param (clean URL)
{
  const result = simulateHandlePageChange('page=3', 1);
  assert.equal(result, '', 'page=1 should result in empty query');
  console.log('PASS: handlePageChange(1) removes page param');
}

// Page > 1 sets the page param
{
  const result = simulateHandlePageChange('', 3);
  assert.equal(result, 'page=3');
  console.log('PASS: handlePageChange(3) sets page param');
}

// Page change preserves other params
{
  const result = simulateHandlePageChange('filter_tag=auth&status=running', 5);
  assert.ok(result.includes('page=5'), 'page should be set');
  assert.ok(result.includes('filter_tag=auth'), 'filter_tag preserved');
  assert.ok(result.includes('status=running'), 'status preserved');
  console.log('PASS: handlePageChange preserves other params');
}

// Page change from existing page
{
  const result = simulateHandlePageChange('page=2&filter_tag=auth', 4);
  assert.ok(result.includes('page=4'), 'page should be updated');
  assert.ok(result.includes('filter_tag=auth'), 'filter_tag preserved');
  assert.ok(!result.includes('page=2'), 'old page should be gone');
  console.log('PASS: handlePageChange updates existing page param');
}

console.log('\nAll pagination reset tests passed!');
