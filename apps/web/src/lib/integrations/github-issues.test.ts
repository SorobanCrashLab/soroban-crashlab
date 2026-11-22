import * as assert from 'node:assert/strict';
import {
  parseGithubIssueUrl,
  createGithubIssuesAdapter,
} from './github-issues';

async function run(): Promise<void> {
  // parseGithubIssueUrl
  assert.deepEqual(
    parseGithubIssueUrl('https://github.com/foo/bar/issues/123'),
    { owner: 'foo', repo: 'bar', issueNumber: 123 },
  );
  assert.deepEqual(
    parseGithubIssueUrl('https://github.com/foo/bar/issues/123/'),
    { owner: 'foo', repo: 'bar', issueNumber: 123 },
  );
  assert.deepEqual(
    parseGithubIssueUrl('https://www.github.com/foo/bar/pull/7'),
    { owner: 'foo', repo: 'bar', issueNumber: 7 },
  );
  assert.equal(parseGithubIssueUrl('not a url'), null);
  assert.equal(parseGithubIssueUrl('https://gitlab.com/foo/bar/issues/1'), null);
  assert.equal(parseGithubIssueUrl('https://github.com/foo/bar'), null);
  assert.equal(parseGithubIssueUrl('https://github.com/foo/bar/issues/abc'), null);
  assert.equal(parseGithubIssueUrl('https://github.com/foo/bar/issues/0'), null);

  // resolveIssueLink — successful API response
  const successAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () =>
      new Response(JSON.stringify({ title: 'Fix crash in fuzzer', state: 'open' }), {
        status: 200,
      })) as unknown as typeof fetch,
  });

  const success = await successAdapter.resolveIssueLink('foo', 'bar', 42);
  assert.equal(success.url, 'https://github.com/foo/bar/issues/42');
  assert.equal(success.title, 'Fix crash in fuzzer');
  assert.equal(success.state, 'open');
  assert.equal(success.resolved, true);

  // resolveIssueLink — closed issue
  const closedAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () =>
      new Response(JSON.stringify({ title: 'Old bug', state: 'closed' }), {
        status: 200,
      })) as unknown as typeof fetch,
  });

  const closed = await closedAdapter.resolveIssueLink('foo', 'bar', 43);
  assert.equal(closed.state, 'closed');
  assert.equal(closed.resolved, true);

  // resolveIssueLink — 404 falls back gracefully, does not throw
  const notFoundAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch,
  });

  const notFound = await notFoundAdapter.resolveIssueLink('foo', 'bar', 999);
  assert.equal(notFound.url, 'https://github.com/foo/bar/issues/999');
  assert.equal(notFound.title, '#999');
  assert.equal(notFound.resolved, false);
  assert.equal(notFound.state, undefined);

  // resolveIssueLink — network error falls back gracefully
  const networkErrorAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch,
  });

  const networkError = await networkErrorAdapter.resolveIssueLink('foo', 'bar', 5);
  assert.equal(networkError.resolved, false);
  assert.equal(networkError.title, '#5');

  // resolveIssueLink — malformed response body falls back gracefully
  const malformedAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () =>
      new Response(JSON.stringify({ notATitle: true }), { status: 200 })) as unknown as typeof fetch,
  });

  const malformed = await malformedAdapter.resolveIssueLink('foo', 'bar', 6);
  assert.equal(malformed.resolved, false);
  assert.equal(malformed.title, '#6');

  // resolveIssueLinkFromUrl — non-GitHub-issue URL returns null
  const adapter = createGithubIssuesAdapter();
  const notApplicable = await adapter.resolveIssueLinkFromUrl('https://jira.example.com/ISSUE-1');
  assert.equal(notApplicable, null);

  // resolveIssueLinkFromUrl — valid URL resolves end-to-end
  const endToEndAdapter = createGithubIssuesAdapter({
    fetchImpl: (async () =>
      new Response(JSON.stringify({ title: 'End to end', state: 'open' }), {
        status: 200,
      })) as unknown as typeof fetch,
  });

  const endToEnd = await endToEndAdapter.resolveIssueLinkFromUrl('https://github.com/foo/bar/issues/1');
  assert.ok(endToEnd);
  assert.equal(endToEnd?.title, 'End to end');

  console.log('github-issues.test.ts: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
