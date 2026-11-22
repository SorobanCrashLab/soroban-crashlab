import { describe, expect, it } from 'vitest';
import {
  buildEmbedSnippet,
  buildShareUrl,
  checkUrlLength,
  createDefaultViewState,
  decodeViewState,
  encodeViewState,
  migrateLegacyParams,
  normalizeViewState,
  URL_LENGTH_WARNING_THRESHOLD,
  VIEW_CODEC_VERSION,
  type ViewState,
} from './view-state';
import {
  addView,
  createSavedView,
  deleteView,
  parseSavedViews,
  renameView,
  SAVED_VIEWS_STORAGE_KEY,
  validateViewName,
  type SavedView,
} from './view-store';

const state = (overrides: Partial<ViewState> = {}): ViewState => ({
  ...createDefaultViewState(),
  ...overrides,
});

describe('codec round-trip', () => {
  it('round-trips the default state', () => {
    const original = createDefaultViewState();
    expect(decodeViewState(encodeViewState(original))).toEqual(original);
  });

  it('round-trips a fully populated state', () => {
    const original = state({
      search: 'status:failed area:auth',
      filters: { status: ['failed'], area: ['auth', 'state'], severity: ['high'], hasCrash: true },
      sort: { key: 'minResourceFee', direction: 'asc' },
      columns: ['id', 'severity', 'status'],
      page: 4,
    });
    expect(decodeViewState(encodeViewState(original))).toEqual(original);
  });

  it('is stable under re-encoding', () => {
    const encoded = encodeViewState(state({ search: 'x', page: 2 }));
    expect(encodeViewState(decodeViewState(encoded))).toBe(encoded);
  });

  it('stamps the codec version', () => {
    expect(new URLSearchParams(encodeViewState(createDefaultViewState())).get('v')).toBe(
      String(VIEW_CODEC_VERSION),
    );
  });

  it('normalises equivalent states to the same encoding', () => {
    const a = state({ filters: { status: ['failed', 'running'], area: [], severity: [], hasCrash: null } });
    const b = state({ filters: { status: ['running', 'failed', 'failed'], area: [], severity: [], hasCrash: null } });
    expect(encodeViewState(a)).toBe(encodeViewState(b));
  });

  it('clamps a nonsense page number', () => {
    expect(normalizeViewState(state({ page: -3 })).page).toBe(1);
    expect(normalizeViewState(state({ page: 2.7 })).page).toBe(2);
    expect(normalizeViewState(state({ page: Number.NaN })).page).toBe(1);
  });
});

describe('fuzz round-trip', () => {
  /** Seeded LCG so a CI failure is reproducible rather than a one-off. */
  function makeRandom(seed: number) {
    let value = seed;
    return () => {
      value = (value * 1664525 + 1013904223) % 4294967296;
      return value / 4294967296;
    };
  }

  const STATUSES = ['running', 'completed', 'failed', 'cancelled'];
  const AREAS = ['auth', 'state', 'budget', 'xdr'];
  const SEVERITIES = ['low', 'medium', 'high', 'critical'];
  const COLUMNS = ['id', 'status', 'area', 'severity', 'duration', 'seedCount'];
  // Awkward search strings: separators, unicode, and characters that must
  // survive percent-encoding intact.
  const SEARCHES = ['', 'auth', 'status:failed', 'a b', 'a,b', 'a&b=c', '100%', 'ünïcødé', '"quoted"', 'a+b'];

  function randomState(random: () => number): ViewState {
    const pick = <T,>(items: readonly T[]) => items.filter(() => random() > 0.6);
    return {
      search: SEARCHES[Math.floor(random() * SEARCHES.length)],
      filters: {
        status: pick(STATUSES),
        area: pick(AREAS),
        severity: pick(SEVERITIES),
        hasCrash: random() < 0.33 ? true : random() < 0.5 ? false : null,
      },
      sort: {
        key: COLUMNS[Math.floor(random() * COLUMNS.length)],
        direction: random() > 0.5 ? 'asc' : 'desc',
      },
      columns: pick(COLUMNS),
      page: Math.floor(random() * 20) + 1,
    };
  }

  it('survives 200 seeded random states', () => {
    const random = makeRandom(20260826);
    for (let index = 0; index < 200; index += 1) {
      const original = normalizeViewState(randomState(random));
      const encoded = encodeViewState(original);
      expect(decodeViewState(encoded)).toEqual(original);
      // And the encoding itself is idempotent.
      expect(encodeViewState(decodeViewState(encoded))).toBe(encoded);
    }
  });
});

describe('forward compatibility', () => {
  it('ignores unknown parameters', () => {
    const decoded = decodeViewState('v=2&q=auth&futureFeature=1&anotherOne=xyz');
    expect(decoded.search).toBe('auth');
  });

  it('ignores a future codec version rather than failing', () => {
    // A v3 link still carries recognisable parameters; decoding degrades to
    // whatever this build understands.
    const decoded = decodeViewState('v=3&q=auth&sk=duration&sd=asc');
    expect(decoded.search).toBe('auth');
    expect(decoded.sort).toEqual({ key: 'duration', direction: 'asc' });
  });

  it('falls back to defaults for an empty querystring', () => {
    expect(decodeViewState('')).toEqual(createDefaultViewState());
    expect(decodeViewState('?')).toEqual(createDefaultViewState());
  });

  it('tolerates a malformed sort direction', () => {
    expect(decodeViewState('v=2&sd=sideways').sort.direction).toBe('desc');
  });
});

describe('legacy v1 import', () => {
  it('maps every v1 parameter to its v2 name', () => {
    const migrated = migrateLegacyParams(
      new URLSearchParams(
        'query=auth&status=failed&area=auth&severity=high&crash=true&sortBy=duration&sortDir=asc&cols=id,status&page=3',
      ),
    );
    expect(Object.fromEntries(migrated)).toEqual({
      v: '2',
      q: 'auth',
      st: 'failed',
      ar: 'auth',
      sv: 'high',
      cr: 'true',
      sk: 'duration',
      sd: 'asc',
      co: 'id,status',
      pg: '3',
    });
  });

  it('decodes a v1 bookmark into the current state shape', () => {
    const decoded = decodeViewState('query=auth&status=failed&sortBy=duration&sortDir=asc&page=3');
    expect(decoded).toEqual(
      normalizeViewState(
        state({
          search: 'auth',
          filters: { status: ['failed'], area: [], severity: [], hasCrash: null },
          sort: { key: 'duration', direction: 'asc' },
          page: 3,
        }),
      ),
    );
  });

  it('prefers an explicit v2 parameter over its legacy twin', () => {
    expect(decodeViewState('q=new&query=old').search).toBe('new');
  });
});

describe('share URL and length guard', () => {
  it('builds a shareable URL', () => {
    const url = buildShareUrl('https://crashlab.example/', '/runs', state({ search: 'auth' }));
    expect(url.startsWith('https://crashlab.example/runs?')).toBe(true);
    expect(new URL(url).searchParams.get('q')).toBe('auth');
  });

  it('stays quiet for a normal URL', () => {
    expect(checkUrlLength('https://crashlab.example/runs?v=2').tooLong).toBe(false);
  });

  it('warns past the threshold and says why', () => {
    const check = checkUrlLength('x'.repeat(URL_LENGTH_WARNING_THRESHOLD + 1));
    expect(check.tooLong).toBe(true);
    expect(check.message).toContain('narrow the filters');
  });

  it('builds an embed snippet with a height hint', () => {
    const snippet = buildEmbedSnippet('https://crashlab.example/runs?v=2', 480);
    expect(snippet).toContain('height="480"');
    expect(snippet).toContain('src="https://crashlab.example/runs?v=2"');
  });
});

describe('saved view store', () => {
  const now = '2026-08-26T00:00:00.000Z';
  const view = (id: string, name: string): SavedView =>
    createSavedView(name, createDefaultViewState(), now, id);

  it('pins the storage key', () => {
    expect(SAVED_VIEWS_STORAGE_KEY).toBe('crashlab:saved-views:v1');
  });

  it('stores the encoded querystring rather than the raw state', () => {
    const saved = createSavedView('Failed auth', state({ search: 'auth' }), now, 'v1');
    expect(saved.encoded).toBe(encodeViewState(state({ search: 'auth' })));
    expect(decodeViewState(saved.encoded).search).toBe('auth');
  });

  it('adds, renames and deletes', () => {
    let views = addView([], view('a', 'First'));
    views = addView(views, view('b', 'Second'));
    expect(views.map((entry) => entry.name)).toEqual(['First', 'Second']);

    views = renameView(views, 'a', 'Renamed', '2026-08-27T00:00:00.000Z');
    expect(views[0].name).toBe('Renamed');
    expect(views[0].updatedAt).toBe('2026-08-27T00:00:00.000Z');

    views = deleteView(views, 'b');
    expect(views.map((entry) => entry.id)).toEqual(['a']);
  });

  it('ignores an empty rename', () => {
    const views = addView([], view('a', 'First'));
    expect(renameView(views, 'a', '   ', now)[0].name).toBe('First');
  });

  it('rejects empty, over-long and duplicate names', () => {
    const existing = [view('a', 'Failed auth')];
    expect(validateViewName('  ', existing)).toBe('View name cannot be empty');
    expect(validateViewName('x'.repeat(61), existing)).toBe('View name cannot exceed 60 characters');
    expect(validateViewName('failed AUTH', existing)).toBe('A view with that name already exists');
    expect(validateViewName('Something else', existing)).toBeNull();
  });

  it('reads corrupt storage as no views', () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews('nope')).toEqual([]);
    expect(parseSavedViews('{"not":"array"}')).toEqual([]);
  });
});
