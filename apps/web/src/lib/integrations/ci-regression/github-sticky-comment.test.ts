import { describe, expect, it } from 'vitest';
import {
  createCheckRun,
  createGithubRestClient,
  GithubApiError,
  splitRepository,
  upsertStickyComment,
} from './github-sticky-comment';

const MARKER = '<!-- crashlab:regression-summary -->';
const REPO = 'SorobanCrashLab/soroban-crashlab';

interface StubComment {
  id: number;
  body: string;
}

/** Minimal in-memory GitHub issues-comments API. */
function githubStub(initial: StubComment[] = [], options: { failWith?: number } = {}) {
  const comments = [...initial];
  const calls: Array<{ method: string; path: string; body?: unknown; auth: string | null }> = [];
  let nextId = 1000;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: `${url.pathname}${url.search}`, body, auth: headers.get('authorization') });

    if (options.failWith) {
      return new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
        status: options.failWith,
      });
    }

    const list = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(url.pathname);
    if (list && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? '1');
      const perPage = Number(url.searchParams.get('per_page') ?? '30');
      return Response.json(comments.slice((page - 1) * perPage, page * perPage));
    }
    if (list && method === 'POST') {
      const created = { id: nextId++, body: body.body };
      comments.push(created);
      return Response.json(created, { status: 201 });
    }
    const edit = /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(url.pathname);
    if (edit && method === 'PATCH') {
      const target = comments.find((c) => c.id === Number(edit[1]));
      if (!target) return Response.json({ message: 'Not Found' }, { status: 404 });
      target.body = body.body;
      return Response.json(target);
    }
    if (url.pathname.endsWith('/check-runs') && method === 'POST') {
      return Response.json({ id: 77 }, { status: 201 });
    }
    return Response.json({ message: 'Not Found' }, { status: 404 });
  }) as typeof fetch;

  return { comments, calls, client: createGithubRestClient({ token: 'ghs_test', fetchImpl }) };
}

describe('upsertStickyComment', () => {
  it('creates the comment on the first run', async () => {
    const stub = githubStub([{ id: 1, body: 'LGTM' }]);
    const outcome = await upsertStickyComment(stub.client, {
      repository: REPO,
      issueNumber: 1891,
      body: `${MARKER}\nfirst`,
      marker: MARKER,
    });
    expect(outcome.action).toBe('created');
    expect(stub.comments).toHaveLength(2);
    expect(stub.calls.every((c) => c.auth === 'Bearer ghs_test')).toBe(true);
    expect(stub.calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/repos/SorobanCrashLab/soroban-crashlab/issues/1891/comments',
    });
  });

  it('edits the existing comment in place on later runs — one comment per PR', async () => {
    const stub = githubStub();
    const input = { repository: REPO, issueNumber: 7, marker: MARKER };
    await upsertStickyComment(stub.client, { ...input, body: `${MARKER}\nrun 1` });
    const second = await upsertStickyComment(stub.client, { ...input, body: `${MARKER}\nrun 2` });
    expect(second.action).toBe('updated');
    expect(stub.comments).toEqual([{ id: 1000, body: `${MARKER}\nrun 2` }]);
  });

  it('skips the edit when the summary did not change', async () => {
    const stub = githubStub([{ id: 5, body: `${MARKER}\nsame` }]);
    const outcome = await upsertStickyComment(stub.client, {
      repository: REPO,
      issueNumber: 7,
      body: `${MARKER}\nsame`,
      marker: MARKER,
    });
    expect(outcome).toEqual({ action: 'unchanged', commentId: 5 });
    expect(stub.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('finds the marker beyond the first page and ignores comments that only quote it', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: `comment ${i}` }));
    const stub = githubStub([
      { id: 500, body: `> ${MARKER}\n> quoted by a reviewer` },
      ...filler,
      { id: 900, body: `${MARKER}\nold` },
    ]);
    const outcome = await upsertStickyComment(stub.client, {
      repository: REPO,
      issueNumber: 7,
      body: `${MARKER}\nnew`,
      marker: MARKER,
    });
    expect(outcome).toEqual({ action: 'updated', commentId: 900 });
    expect(stub.comments.find((c) => c.id === 500)?.body).toContain('quoted by a reviewer');
  });

  it('surfaces GitHub errors (e.g. a fork PR read-only token) as GithubApiError', async () => {
    const stub = githubStub([], { failWith: 403 });
    const attempt = upsertStickyComment(stub.client, {
      repository: REPO,
      issueNumber: 7,
      body: `${MARKER}\nx`,
      marker: MARKER,
    });
    await expect(attempt).rejects.toBeInstanceOf(GithubApiError);
    await expect(attempt).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a body that does not start with the marker', async () => {
    const stub = githubStub();
    await expect(
      upsertStickyComment(stub.client, { repository: REPO, issueNumber: 7, body: 'no marker', marker: MARKER }),
    ).rejects.toThrow(/marker/);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('createCheckRun', () => {
  it('posts a completed check run with the concise output', async () => {
    const stub = githubStub();
    const id = await createCheckRun(stub.client, {
      repository: REPO,
      headSha: 'a'.repeat(40),
      name: 'CrashLab regression summary',
      conclusion: 'failure',
      title: 'Regression gate: 1 new failure',
      summary: 'summary',
      detailsUrl: 'https://github.com/x/y/actions/runs/1',
    });
    expect(id).toBe(77);
    expect(stub.calls[0].body).toEqual({
      name: 'CrashLab regression summary',
      head_sha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'failure',
      details_url: 'https://github.com/x/y/actions/runs/1',
      output: { title: 'Regression gate: 1 new failure', summary: 'summary' },
    });
  });
});

describe('splitRepository', () => {
  it('accepts owner/repo and rejects anything else', () => {
    expect(splitRepository('a/b')).toEqual({ owner: 'a', repo: 'b' });
    expect(() => splitRepository('a/b/c')).toThrow();
    expect(() => splitRepository('../x')).toThrow();
  });
});
