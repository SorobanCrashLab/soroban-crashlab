import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  DEFAULT_ACCESSIBILITY_PREFS,
  DEFAULT_ASSISTIVE_MODE_PREFS,
  parseAccessibilityPrefs,
  parseAssistiveModePrefs,
} from '@/lib/accessibility-prefs';
import {
  buildAssistiveChartSummary,
  getPatternShapeLabel,
} from './AssistiveModesProvider';
import {
  computeContrastRatio,
  computeRelativeLuminance,
  evaluateTokenContrastSamples,
  parseHexColor,
  runLiveDomDiagnostics,
  validateHeadingLevels,
} from './DiagnosticsPanel';
import {
  DELETE,
  GET,
  POST,
  PUT,
} from '@/app/api/accessibility/preferences/route';

describe('Accessibility Preferences & Assistive Diagnostics Center (#2317)', () => {
  describe('Preference Model & Parser', () => {
    it('preserves backward compatibility with base prefs and parses extended fields', () => {
      expect(parseAccessibilityPrefs(DEFAULT_ACCESSIBILITY_PREFS)).toEqual(
        DEFAULT_ACCESSIBILITY_PREFS,
      );

      const extended = parseAccessibilityPrefs({
        motion: 'reduced',
        textScale: 150,
        contrast: 'high',
        lineHeight: 'relaxed',
        density: 'spacious',
        focusIndicator: 'high-visibility',
        pointerTarget: 'large',
        keyboardNavigation: 'roving-grid',
        assistiveModes: {
          chartDataTableAlternative: true,
          autoSummaryDescriptions: true,
          patternShapeEncoding: true,
          simplifiedDenseLayout: false,
        },
        syncConsent: true,
        workspaceScope: 'contract-audit',
      });

      expect(extended).toMatchObject({
        motion: 'reduced',
        textScale: 150,
        contrast: 'high',
        lineHeight: 'relaxed',
        density: 'spacious',
        focusIndicator: 'high-visibility',
        pointerTarget: 'large',
        keyboardNavigation: 'roving-grid',
        syncConsent: true,
        workspaceScope: 'contract-audit',
      });
      expect(extended.assistiveModes?.chartDataTableAlternative).toBe(true);
      expect(extended.assistiveModes?.patternShapeEncoding).toBe(true);
    });

    it('falls back safely on invalid assistive mode inputs', () => {
      expect(parseAssistiveModePrefs(null)).toEqual(DEFAULT_ASSISTIVE_MODE_PREFS);
      expect(
        parseAssistiveModePrefs({
          chartDataTableAlternative: 1,
          autoSummaryDescriptions: false,
        }),
      ).toEqual({
        chartDataTableAlternative: true,
        autoSummaryDescriptions: false,
        patternShapeEncoding: false,
        simplifiedDenseLayout: false,
      });
    });
  });

  describe('Assistive Visualization Summaries & Pattern Encoding', () => {
    it('generates deterministic natural-language chart summaries', () => {
      const summary = buildAssistiveChartSummary('Coverage by Contract', [
        { label: 'Token', value: 86, unit: '%' },
        { label: 'Vault', value: 71, unit: '%' },
        { label: 'Oracle', value: 54, unit: '%' },
      ]);
      expect(summary).toContain('Coverage by Contract (3 points)');
      expect(summary).toContain('peak at Token (86 %)');
      expect(summary).toContain('lowest at Oracle (54 %)');
      expect(summary).toContain('mean 70.3 %');
    });

    it('handles empty chart series gracefully', () => {
      expect(buildAssistiveChartSummary('Empty Chart', [])).toBe(
        'Empty Chart: No data points recorded.',
      );
    });

    it('cycles distinct geometric pattern labels for non-colour encoding', () => {
      expect(getPatternShapeLabel(0)).not.toBe(getPatternShapeLabel(1));
      expect(getPatternShapeLabel(4)).toBe(getPatternShapeLabel(0));
    });
  });

  describe('WCAG 2.2 Diagnostics: Contrast, Luminance & Heading Hierarchy', () => {
    it('computes accurate sRGB relative luminance and WCAG contrast ratios', () => {
      expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
      expect(computeRelativeLuminance(0, 0, 0)).toBe(0);
      expect(computeRelativeLuminance(255, 255, 255)).toBeCloseTo(1, 4);
      expect(computeContrastRatio('#FFFFFF', '#000000')).toBe(21);
      expect(computeContrastRatio('#FFFFFF', '#0A66C2')).toBeGreaterThanOrEqual(4.5);
    });

    it('audits default design-system token pairs against WCAG AA', () => {
      const samples = evaluateTokenContrastSamples();
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.every((s) => s.passesAA)).toBe(true);
    });

    it('validates heading level sequences for skipped levels', () => {
      expect(validateHeadingLevels([1, 2, 2, 3, 2])).toBe(true);
      expect(validateHeadingLevels([1, 3])).toBe(false);
    });

    it('runs SSR-safe DOM diagnostics when document is absent', () => {
      const report = runLiveDomDiagnostics(undefined);
      expect(report.contrastSamples.length).toBeGreaterThan(0);
      expect(report.headingHierarchyValid).toBe(true);
    });
  });

  describe('API Route: /api/accessibility/preferences (Consent & Privacy)', () => {
    it('refuses server-side persistence when sync consent is false', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/accessibility/preferences',
        {
          method: 'PUT',
          body: JSON.stringify({
            scope: 'triage-ops',
            consent: false,
            preferences: { motion: 'reduced', textScale: 125, contrast: 'high' },
          }),
        },
      );
      const res = await PUT(req);
      const json = (await res.json()) as { persisted: boolean; consent: boolean };
      expect(res.status).toBe(200);
      expect(json.persisted).toBe(false);
      expect(json.consent).toBe(false);
    });

    it('persists workspace preferences when consent is explicitly granted and retrieves them via GET', async () => {
      const putReq = new NextRequest(
        'http://localhost:3000/api/accessibility/preferences',
        {
          method: 'PUT',
          body: JSON.stringify({
            scope: 'contract-audit',
            consent: true,
            preferences: {
              motion: 'reduced',
              textScale: 125,
              contrast: 'high',
              density: 'compact',
            },
          }),
        },
      );
      const putRes = await PUT(putReq);
      const putJson = (await putRes.json()) as {
        persisted: boolean;
        scope: string;
        preferences: { motion: string; density: string };
      };
      expect(putJson.persisted).toBe(true);
      expect(putJson.scope).toBe('contract-audit');
      expect(putJson.preferences.motion).toBe('reduced');
      expect(putJson.preferences.density).toBe('compact');

      const getReq = new NextRequest(
        'http://localhost:3000/api/accessibility/preferences?scope=contract-audit',
      );
      const getRes = await GET(getReq);
      const getJson = (await getRes.json()) as {
        scope: string;
        consent: boolean;
        preferences: { textScale: number };
      };
      expect(getJson.scope).toBe('contract-audit');
      expect(getJson.consent).toBe(true);
      expect(getJson.preferences.textScale).toBe(125);

      const delReq = new NextRequest(
        'http://localhost:3000/api/accessibility/preferences?scope=contract-audit',
        { method: 'DELETE' },
      );
      const delRes = await DELETE(delReq);
      const delJson = (await delRes.json()) as { deleted: boolean };
      expect(delJson.deleted).toBe(true);
    });

    it('ingests barrier feedback and automatically redacts personal data and tokens', async () => {
      const postReq = new NextRequest(
        'http://localhost:3000/api/accessibility/preferences',
        {
          method: 'POST',
          body: JSON.stringify({
            kind: 'barrier-feedback',
            route: '/runs/99?token=secret12345',
            component: 'TraceCanvas',
            description:
              'Contact reporter@example.com or account 123456789012: keyboard focus lost on zoom.',
            screenshotSummary: 'FocusStops=18; token=abc987',
          }),
        },
      );
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(201);
      const data = (await postRes.json()) as {
        created: boolean;
        feedback: {
          id: string;
          route: string;
          description: string;
          screenshotRedactedSummary?: string;
        };
      };
      expect(data.created).toBe(true);
      expect(data.feedback.description).not.toContain('reporter@example.com');
      expect(data.feedback.description).not.toContain('123456789012');
      expect(data.feedback.route).not.toContain('secret12345');
      expect(data.feedback.screenshotRedactedSummary).not.toContain('abc987');
    });
  });
});
