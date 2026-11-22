/**
 * Interactive runbook model (#2301). Pure types shared by the engine, API
 * routes and UI.
 */

export type EvidenceKind = 'log' | 'trace' | 'diff' | 'artifact' | 'screenshot' | 'note';
export type StepKind = 'manual' | 'decision' | 'automation';
export type AutomationAction = 'rerun' | 'replay' | 'pause_campaign' | 'notify' | 'create_issue';
export type RunbookRole = 'viewer' | 'responder' | 'maintainer';
export type TemplateStatus = 'draft' | 'pending_approval' | 'approved';

export interface StepCondition {
  /** Show this step only when the earlier decision step has this outcome. */
  stepId: string;
  equals: string;
}

export interface RunbookStep {
  id: string;
  title: string;
  instructions: string;
  kind: StepKind;
  /** Minimum role allowed to complete the step. */
  role?: RunbookRole;
  requiredEvidence?: EvidenceKind[];
  condition?: StepCondition;
  /** Decision steps: allowed outcomes. */
  options?: string[];
  automation?: { action: AutomationAction; requiresApproval: boolean };
  slaMinutes?: number;
}

export interface RunbookTemplate {
  id: string;
  title: string;
  failureType: string;
  service: string;
  workspace: string;
  version: number;
  status: TemplateStatus;
  approvedBy?: string;
  updatedAt: string;
  steps: RunbookStep[];
}

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  /** Link to the source artifact (run, trace, log, ...). */
  ref: string;
  addedBy: string;
  addedAt: string;
}

export interface StepState {
  status: StepStatus;
  assignee?: string;
  notes: string;
  evidence: EvidenceItem[];
  outcome?: string;
  startedAt?: string;
  completedAt?: string;
  blockedReason?: string;
  approval?: { requestedBy: string; approvedBy?: string; at: string };
}

export interface AuditEvent {
  at: string;
  actor: string;
  type:
    | 'started'
    | 'step_started'
    | 'step_completed'
    | 'step_blocked'
    | 'evidence_added'
    | 'automation_dry_run'
    | 'approval_requested'
    | 'approved'
    | 'automation_executed'
    | 'completed'
    | 'aborted';
  stepId?: string;
  detail?: string;
}

export interface ExecutionContext {
  /** Where the playbook was launched from. */
  source: 'incident' | 'triage' | 'run' | 'regression' | 'integration' | 'manual';
  refId?: string;
}

export interface RunbookExecution {
  id: string;
  templateId: string;
  templateVersion: number;
  context: ExecutionContext;
  status: 'in_progress' | 'completed' | 'aborted';
  steps: Record<string, StepState>;
  audit: AuditEvent[];
  startedAt: string;
  completedAt?: string;
  feedback?: { helpful: boolean; comment: string; suggestedChange?: string };
}
