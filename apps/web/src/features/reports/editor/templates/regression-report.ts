import type { ReportTemplate } from './types';

export const regressionReportTemplate: ReportTemplate = {
  id: 'regression-report',
  title: 'Regression report',
  description: 'Expected vs observed behaviour with environment and bisect notes.',
  body: `# {{title}}

**Regression ID:** {{incident_id}}  
**Author:** {{author}}  
**Date:** {{date}}

## Expected behaviour

Describe the behaviour before the regression.

## Observed behaviour

Describe what happens now, including error codes.

## Environment

| Field | Value |
| --- | --- |
| Protocol | TBD |
| Commit | TBD |
| Seed / fixture | TBD |

## Minimal reproducer

\`\`\`text
Paste the smallest command or test that reproduces the issue
\`\`\`

## Evidence

/evidence run {{run_id}}

## Suspected change

- TBD

## Checklist

- [ ] Bisected to a commit range
- [ ] Fixture is deterministic
- [ ] Owner and severity agreed
`,
};
