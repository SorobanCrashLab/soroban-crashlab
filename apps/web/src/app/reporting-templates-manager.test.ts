/**
 * Tests for Reporting Templates Manager core logic.
 * Covers: template filtering, search, tag deduplication, and edge cases.
 */
import * as assert from 'node:assert/strict';

// ── Types (mirrored from component) ──────────────────────────────────────────

type TemplateKind = 'issue' | 'pr';

interface ManagedTemplate {
    id: string;
    name: string;
    kind: TemplateKind;
    body: string;
    updatedAt: string;
    pinned: boolean;
    tags: string[];
}

// ── Pure helpers under test ───────────────────────────────────────────────────

function filterTemplates(
    templates: ManagedTemplate[],
    opts: { search: string; kindFilter: 'all' | TemplateKind; tagFilter: string },
): ManagedTemplate[] {
    const q = opts.search.trim().toLowerCase();
    return templates
        .filter((t) => {
            if (opts.kindFilter !== 'all' && t.kind !== opts.kindFilter) return false;
            if (opts.tagFilter && !t.tags.includes(opts.tagFilter)) return false;
            if (q) {
                return (
                    t.name.toLowerCase().includes(q) ||
                    t.body.toLowerCase().includes(q) ||
                    t.tags.some((tag) => tag.includes(q))
                );
            }
            return true;
        })
        .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

function collectAllTags(templates: ManagedTemplate[]): string[] {
    const set = new Set<string>();
    templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort();
}

function isManagedTemplate(v: unknown): v is ManagedTemplate {
    if (!v || typeof v !== 'object') return false;
    const c = v as Partial<ManagedTemplate>;
    return (
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        (c.kind === 'issue' || c.kind === 'pr') &&
        typeof c.body === 'string' &&
        typeof c.updatedAt === 'string' &&
        typeof c.pinned === 'boolean' &&
        Array.isArray(c.tags)
    );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeTemplate = (overrides: Partial<ManagedTemplate> = {}): ManagedTemplate => ({
    id: `tpl-${Math.random().toString(16).slice(2)}`,
    name: 'Test Template',
    kind: 'issue',
    body: '# Test\n',
    updatedAt: new Date().toISOString(),
    pinned: false,
    tags: [],
    ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. filterTemplates — no filters returns all, pinned first
{
    const templates = [
        makeTemplate({ id: 'a', pinned: false }),
        makeTemplate({ id: 'b', pinned: true }),
        makeTemplate({ id: 'c', pinned: false }),
    ];
    const result = filterTemplates(templates, { search: '', kindFilter: 'all', tagFilter: '' });
    assert.equal(result.length, 3);
    assert.equal(result[0].id, 'b', 'pinned template should sort first');
}

// 2. filterTemplates — kind filter
{
    const templates = [
        makeTemplate({ id: 'issue-1', kind: 'issue' }),
        makeTemplate({ id: 'pr-1', kind: 'pr' }),
        makeTemplate({ id: 'issue-2', kind: 'issue' }),
    ];
    const result = filterTemplates(templates, { search: '', kindFilter: 'pr', tagFilter: '' });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'pr-1');
}

// 3. filterTemplates — text search matches name
{
    const templates = [
        makeTemplate({ id: 'a', name: 'Crash Report Template' }),
        makeTemplate({ id: 'b', name: 'PR Fix Notes' }),
    ];
    const result = filterTemplates(templates, { search: 'crash', kindFilter: 'all', tagFilter: '' });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'a');
}

// 4. filterTemplates — text search matches body
{
    const templates = [
        makeTemplate({ id: 'a', body: '# Invariant Violation\n' }),
        makeTemplate({ id: 'b', body: '# Fix Summary\n' }),
    ];
    const result = filterTemplates(templates, { search: 'invariant', kindFilter: 'all', tagFilter: '' });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'a');
}

// 5. filterTemplates — tag filter
{
    const templates = [
        makeTemplate({ id: 'a', tags: ['crash', 'triage'] }),
        makeTemplate({ id: 'b', tags: ['fix'] }),
        makeTemplate({ id: 'c', tags: ['crash'] }),
    ];
    const result = filterTemplates(templates, { search: '', kindFilter: 'all', tagFilter: 'crash' });
    assert.equal(result.length, 2);
    assert.ok(result.some((t) => t.id === 'a'));
    assert.ok(result.some((t) => t.id === 'c'));
}

// 6. filterTemplates — no match returns empty array
{
    const templates = [makeTemplate({ name: 'Alpha' }), makeTemplate({ name: 'Beta' })];
    const result = filterTemplates(templates, { search: 'zzz-no-match', kindFilter: 'all', tagFilter: '' });
    assert.equal(result.length, 0);
}

// 7. collectAllTags — deduplicates and sorts
{
    const templates = [
        makeTemplate({ tags: ['crash', 'triage'] }),
        makeTemplate({ tags: ['fix', 'crash'] }),
        makeTemplate({ tags: ['review'] }),
    ];
    const tags = collectAllTags(templates);
    assert.deepEqual(tags, ['crash', 'fix', 'review', 'triage']);
}

// 8. collectAllTags — empty templates returns empty array
{
    assert.deepEqual(collectAllTags([]), []);
}

// 9. isManagedTemplate — valid object passes
{
    const valid = makeTemplate();
    assert.ok(isManagedTemplate(valid));
}

// 10. isManagedTemplate — rejects invalid kind
{
    const invalid = { ...makeTemplate(), kind: 'unknown' };
    assert.ok(!isManagedTemplate(invalid));
}

// 11. isManagedTemplate — rejects non-object
{
    assert.ok(!isManagedTemplate(null));
    assert.ok(!isManagedTemplate('string'));
    assert.ok(!isManagedTemplate(42));
}

// 12. Edge case: filterTemplates with combined kind + tag + search
{
    const templates = [
        makeTemplate({ id: 'match', kind: 'issue', tags: ['crash'], name: 'Crash Report' }),
        makeTemplate({ id: 'wrong-kind', kind: 'pr', tags: ['crash'], name: 'Crash Report' }),
        makeTemplate({ id: 'wrong-tag', kind: 'issue', tags: ['fix'], name: 'Alpha Notes' }),
        makeTemplate({ id: 'wrong-name', kind: 'issue', tags: ['crash'], name: 'Beta Notes' }),
    ];
    // search 'crash' matches name "Crash Report" or tag "crash"
    // kindFilter 'issue' excludes 'wrong-kind'
    // tagFilter 'crash' excludes 'wrong-tag' (tags: ['fix'])
    // 'wrong-name' has tag 'crash' and kind 'issue' but name/body don't match 'crash' — wait, search also matches tags
    // So 'wrong-name' has tag 'crash' which matches search, kind 'issue', tag 'crash' — it WILL match
    // Use a search term that only matches the name, not the tag
    const result = filterTemplates(templates, { search: 'report', kindFilter: 'issue', tagFilter: 'crash' });
    // 'match': kind=issue ✓, tag=crash ✓, name contains 'report' ✓
    // 'wrong-kind': kind=pr ✗
    // 'wrong-tag': tags=['fix'] ✗
    // 'wrong-name': name='Beta Notes' ✗, body='# Test\n' ✗, tags=['crash'] doesn't contain 'report' ✗
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'match');
}

console.log('reporting-templates-manager.test.ts: all assertions passed');
