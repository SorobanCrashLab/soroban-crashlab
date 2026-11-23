import { describe, expect, it } from 'vitest';
import { applyTemplate, getTemplate, listTemplates, renderTemplate } from './index';

describe('report templates', () => {
  it('ships all four required templates', () => {
    expect(listTemplates().map((template) => template.id)).toEqual([
      'postmortem',
      'triage-summary',
      'regression-report',
      'campaign-retrospective',
    ]);
    expect(getTemplate('postmortem')?.title).toBe('Incident postmortem');
  });

  it('renders placeholders deterministically', () => {
    const template = getTemplate('triage-summary')!;
    const now = new Date('2026-11-23T00:00:00Z');
    const first = renderTemplate(template, { incident_id: 'INC-9', title: 'Crash triage' }, now);
    const second = renderTemplate(template, { incident_id: 'INC-9', title: 'Crash triage' }, now);
    expect(first).toBe(second);
    expect(first).toContain('# Crash triage');
    expect(first).toContain('**Issue:** INC-9');
    expect(first).toContain('2026-11-23');
    expect(first).not.toContain('{{incident_id}}');
  });

  it('keeps unknown placeholders visible instead of guessing', () => {
    const template = getTemplate('postmortem')!;
    expect(renderTemplate({ ...template, body: '{{custom_value}}' })).toBe('{{custom_value}}');
  });

  it('replaces or appends templates deterministically', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const replaced = applyTemplate('regression-report', 'old body', { now });
    expect(replaced).not.toContain('old body');
    const appended = applyTemplate('campaign-retrospective', 'old body', { mode: 'append', now });
    expect(appended.startsWith('old body\n\n---\n\n# ')).toBe(true);
    expect(applyTemplate('campaign-retrospective', 'old body', { mode: 'append', now })).toBe(appended);
  });

  it('throws for an unknown template id', () => {
    expect(() => applyTemplate('missing', '')).toThrow('Unknown report template');
  });
});
