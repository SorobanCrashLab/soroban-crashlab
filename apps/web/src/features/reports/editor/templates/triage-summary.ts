import type { ReportTemplate } from './types';

export const triageSummaryTemplate: ReportTemplate = {
  id: 'triage-summary',
  title: 'Triage summary',
  description: 'Compact triage note for a crash cluster or incoming issue.',
  body: `# {{title}}

**Issue:** {{incident_id}}  
**Triage owner:** {{author}}  
**Date:** {{date}}

## Signature

- Crash signature: TBD
- First seen: TBD
- Frequency: TBD

## Reproduction

1. TBD

## Evidence

/evidence crash {{crash_id}}

## Assessment

| Question | Answer |
| --- | --- |
| Reproducible? | TBD |
| Regression? | TBD |
| Severity | TBD |

## Next steps

- [ ] Confirm minimal repro
- [ ] Link related runs
- [ ] Decide disposition
`,
};
