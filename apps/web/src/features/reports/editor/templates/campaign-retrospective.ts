import type { ReportTemplate } from './types';

export const campaignRetrospectiveTemplate: ReportTemplate = {
  id: 'campaign-retrospective',
  title: 'Campaign retrospective',
  description: 'Coverage, findings and follow-ups for a fuzzing or validation campaign.',
  body: `# {{title}}

**Campaign:** {{incident_id}}  
**Author:** {{author}}  
**Date:** {{date}}

## Goals

- TBD

## Coverage

| Dimension | Value |
| --- | --- |
| Runs | TBD |
| Seeds | TBD |
| Wall time | TBD |

## Key findings

| Finding | Severity | Status |
| --- | --- | --- |
| TBD | TBD | TBD |

## Evidence

/evidence chart {{chart_id}}

## Surprises

- TBD

## Follow-ups

- [ ] File issues for confirmed findings
- [ ] Update campaign configuration
- [ ] Share retrospective
`,
};
