/** Report templates and deterministic application helpers. */
import { normalizeNewlines } from '../lib/serialization';
import { campaignRetrospectiveTemplate } from './campaign-retrospective';
import { postmortemTemplate } from './postmortem';
import { regressionReportTemplate } from './regression-report';
import { triageSummaryTemplate } from './triage-summary';
import type { ReportTemplate, TemplateId } from './types';

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  postmortemTemplate,
  triageSummaryTemplate,
  regressionReportTemplate,
  campaignRetrospectiveTemplate,
];

export type TemplateApplicationMode = 'replace' | 'append';

export interface ApplyTemplateOptions {
  mode?: TemplateApplicationMode;
  variables?: Record<string, string>;
  now?: Date;
}

export function listTemplates(): readonly ReportTemplate[] {
  return REPORT_TEMPLATES;
}

export function getTemplate(id: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((template) => template.id === id);
}

export function isTemplateId(value: string): value is TemplateId {
  return REPORT_TEMPLATES.some((template) => template.id === value);
}

export function renderTemplate(
  template: ReportTemplate,
  variables: Record<string, string> = {},
  now: Date = new Date(),
): string {
  const defaults: Record<string, string> = {
    title: template.title,
    incident_id: 'INCIDENT-ID',
    author: '@author',
    date: now.toISOString().slice(0, 10),
    run_id: 'run-001',
    crash_id: 'crash-017',
    chart_id: 'chart-88',
  };
  const values = { ...defaults, ...variables };
  return normalizeNewlines(
    template.body.replace(/\{\{([a-z_][a-z0-9_]*)\}\}/gi, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
    ),
  );
}

/**
 * Apply a template to a document. `replace` produces only the rendered
 * template; `append` keeps the current Markdown and adds a separated copy.
 */
export function applyTemplate(
  templateId: string,
  currentMarkdown: string,
  options: ApplyTemplateOptions = {},
): string {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown report template: ${templateId}`);
  const rendered = renderTemplate(template, options.variables, options.now);
  if ((options.mode ?? 'replace') === 'replace') return rendered;
  const existing = normalizeNewlines(currentMarkdown).trimEnd();
  return existing ? `${existing}\n\n---\n\n${rendered}` : rendered;
}

export type { ReportTemplate, TemplateId } from './types';
