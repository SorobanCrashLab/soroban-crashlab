import type { ReportTemplate } from './types';

export const postmortemTemplate: ReportTemplate = {
  id: 'postmortem',
  title: 'Incident postmortem',
  description: 'Blameless postmortem with timeline, impact, root cause and follow-ups.',
  body: `# {{title}}

**Incident:** {{incident_id}}  
**Author:** {{author}}  
**Date:** {{date}}

## Summary

Describe the user-visible impact and how it was detected.

## Impact

| Dimension | Detail |
| --- | --- |
| Duration | TBD |
| Affected users | TBD |
| Severity | TBD |

## Timeline

| Time (UTC) | Event |
| --- | --- |
| TBD | Detection |
| TBD | Mitigation |
| TBD | Resolution |

## Contributing factors

- TBD

## Root cause

Explain the causal chain without assigning blame.

## Evidence

/evidence run {{run_id}}

## What went well

- TBD

## What went poorly

- TBD

## Action items

- [ ] Owner assigned for each action
- [ ] Follow-up linked
`,
};
