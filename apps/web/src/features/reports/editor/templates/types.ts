export type TemplateId =
  | 'postmortem'
  | 'triage-summary'
  | 'regression-report'
  | 'campaign-retrospective';

export interface ReportTemplate {
  id: TemplateId;
  title: string;
  description: string;
  body: string;
}
