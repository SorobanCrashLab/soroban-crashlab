/**
 * /api/accessibility/preferences — Global & per-workspace accessibility
 * preference persistence and privacy-safe barrier feedback intake (#2317).
 *
 * Non-functional guarantees:
 * - No tracking or storage of assistive preferences on the server unless
 *   explicit `consent === true` is provided (`CONSENT_REQUIRED` otherwise).
 * - Automatic PII redaction on barrier report metadata and descriptions.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_ACCESSIBILITY_PREFS,
  DEFAULT_ASSISTIVE_MODE_PREFS,
  parseAccessibilityPrefs,
  type AccessibilityPrefs,
} from '@/lib/accessibility-prefs';
import { redactPersonalData } from '@/features/a11y-compliance/model';

export const dynamic = 'force-dynamic';

export interface StoredAccessibilityPreferenceRecord {
  scope: string;
  preferences: AccessibilityPrefs;
  consent: boolean;
  updatedAt: string;
}

export interface AccessibilityBarrierFeedbackRecord {
  id: string;
  route: string;
  component: string;
  description: string;
  assistiveContext: {
    motion: string;
    textScale: number;
    contrast: string;
    density: string;
    focusIndicator: string;
  };
  screenshotRedactedSummary?: string;
  createdAt: string;
}

interface AccessibilityPreferencesServerStore {
  byScope: Map<string, StoredAccessibilityPreferenceRecord>;
  feedback: AccessibilityBarrierFeedbackRecord[];
  seq: number;
}

const globalForPrefs = globalThis as unknown as {
  __a11yPreferencesStore?: AccessibilityPreferencesServerStore;
};

function getServerStore(): AccessibilityPreferencesServerStore {
  if (!globalForPrefs.__a11yPreferencesStore) {
    const byScope = new Map<string, StoredAccessibilityPreferenceRecord>();
    byScope.set('global', {
      scope: 'global',
      preferences: {
        ...DEFAULT_ACCESSIBILITY_PREFS,
        lineHeight: 'normal',
        density: 'comfortable',
        focusIndicator: 'default',
        pointerTarget: 'standard',
        keyboardNavigation: 'standard',
        assistiveModes: { ...DEFAULT_ASSISTIVE_MODE_PREFS },
        syncConsent: false,
        workspaceScope: 'global',
      },
      consent: false,
      updatedAt: new Date().toISOString(),
    });
    globalForPrefs.__a11yPreferencesStore = {
      byScope,
      feedback: [],
      seq: 0,
    };
  }
  return globalForPrefs.__a11yPreferencesStore;
}

function redactBarrierMetadata(text: string): string {
  return redactPersonalData(text).replace(
    /\b((?:token|key|auth|session|code|secret)\s*[:=]\s*)[^\s;,]+/gi,
    '$1[redacted]',
  );
}

function normalizeScope(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return 'global';
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned.slice(0, 64) || 'global';
}

export async function GET(req: NextRequest) {
  const store = getServerStore();
  const scope = normalizeScope(req.nextUrl.searchParams.get('scope'));
  const record = store.byScope.get(scope) ?? store.byScope.get('global')!;

  return NextResponse.json({
    scope,
    preferences: record.preferences,
    consent: record.consent,
    updatedAt: record.updatedAt,
    scopes: Array.from(store.byScope.keys()),
    feedbackCount: store.feedback.length,
  });
}

export async function PUT(req: NextRequest) {
  const store = getServerStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const scope = normalizeScope(
    typeof body.scope === 'string' ? body.scope : 'global',
  );
  const consent = Boolean(body.consent);

  // Privacy guardrail: never persist sensitive assistive preferences server-side without consent.
  if (!consent) {
    store.byScope.delete(scope);
    return NextResponse.json({
      scope,
      persisted: false,
      consent: false,
      reason:
        'Assistive preferences remain device-local only until sync consent is granted.',
    });
  }

  const parsedPrefs = parseAccessibilityPrefs(body.preferences ?? body);
  parsedPrefs.syncConsent = true;
  parsedPrefs.workspaceScope = scope;

  const record: StoredAccessibilityPreferenceRecord = {
    scope,
    preferences: parsedPrefs,
    consent: true,
    updatedAt: new Date().toISOString(),
  };
  store.byScope.set(scope, record);

  return NextResponse.json({
    scope,
    persisted: true,
    consent: true,
    preferences: record.preferences,
    updatedAt: record.updatedAt,
  });
}

export async function POST(req: NextRequest) {
  const store = getServerStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.kind === 'barrier-feedback') {
    const rawDesc =
      typeof body.description === 'string' ? body.description.trim() : '';
    if (!rawDesc) {
      return NextResponse.json(
        { error: '`description` is required for accessibility barrier feedback.' },
        { status: 400 },
      );
    }

    store.seq += 1;
    const id = `a11y-fb-${String(store.seq).padStart(4, '0')}`;
    const prefs = parseAccessibilityPrefs(body.preferences ?? {});
    const route =
      typeof body.route === 'string' && body.route.trim()
        ? redactBarrierMetadata(body.route.trim()).slice(0, 200)
        : '/settings/accessibility';
    const component =
      typeof body.component === 'string' && body.component.trim()
        ? redactBarrierMetadata(body.component.trim()).slice(0, 120)
        : 'AccessibilityPreferencesCenter';

    const record: AccessibilityBarrierFeedbackRecord = {
      id,
      route,
      component,
      description: redactBarrierMetadata(rawDesc),
      assistiveContext: {
        motion: prefs.motion,
        textScale: prefs.textScale,
        contrast: prefs.contrast,
        density: prefs.density ?? 'comfortable',
        focusIndicator: prefs.focusIndicator ?? 'default',
      },
      screenshotRedactedSummary:
        typeof body.screenshotSummary === 'string' && body.screenshotSummary.trim()
          ? redactBarrierMetadata(body.screenshotSummary.trim()).slice(0, 300)
          : undefined,
      createdAt: new Date().toISOString(),
    };

    store.feedback.unshift(record);
    if (store.feedback.length > 200) store.feedback.length = 200;

    return NextResponse.json({ feedback: record, created: true }, { status: 201 });
  }

  return PUT(req);
}

export async function DELETE(req: NextRequest) {
  const store = getServerStore();
  const scope = normalizeScope(req.nextUrl.searchParams.get('scope'));
  if (scope !== 'global') {
    store.byScope.delete(scope);
  }
  return NextResponse.json({ scope, deleted: scope !== 'global' });
}
