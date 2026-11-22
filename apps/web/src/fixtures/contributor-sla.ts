export interface SLATarget {
  event: string;
  timer: string;
  owner: string;
  escalation: string;
}

export interface ActiveSLAItem {
  id: string;
  type: 'issue' | 'pr' | 'application';
  title: string;
  startTime: Date;
  limitHours: number;
  escalationHours: number;
  owner: string;
}

export const SLA_TARGETS: SLATarget[] = [
  { event: 'New application received', timer: '24 h', owner: 'Wave maintainer', escalation: 'Wave lead at 36 h' },
  { event: 'Issue assigned — first update', timer: '24 h', owner: 'Assigned contributor', escalation: 'Un-assign + re-open at 48 h' },
  { event: 'PR submitted — first review', timer: '24 h', owner: 'Assigned reviewer', escalation: 'Any available maintainer at 36 h' },
  { event: 'PR review comment — response', timer: '48 h', owner: 'Assigned contributor', escalation: 'Stale label + ping at 60 h' },
  { event: 'Merge-blocked PR — resolved', timer: '24 h', owner: 'Blocking maintainer', escalation: 'Wave lead escalation at 36 h' },
  { event: 'New triage issue (unlabelled)', timer: '48 h', owner: 'Triage maintainer', escalation: 'Wave lead at 72 h' },
];

export const MOCK_ACTIVE_ITEMS: ActiveSLAItem[] = [
  {
    id: 'PR-418',
    type: 'pr',
    title: 'Implement Deterministic Suite Ordering',
    startTime: new Date(Date.now() - 18 * 60 * 60 * 1000),
    limitHours: 24,
    escalationHours: 36,
    owner: '@maintainer-alpha'
  },
  {
    id: 'ISSUE-392',
    type: 'issue',
    title: 'Add Flash-Loan Reentrancy Guards',
    startTime: new Date(Date.now() - 42 * 60 * 60 * 1000),
    limitHours: 24,
    escalationHours: 48,
    owner: '@contributor-x'
  },
  {
    id: 'APP-92',
    type: 'application',
    title: 'Application from @new-dev',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
    limitHours: 24,
    escalationHours: 36,
    owner: 'Unassigned'
  }
];
