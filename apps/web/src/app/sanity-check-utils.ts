export type PipelineStatus = 'idle' | 'running' | 'passed' | 'failed' | 'warning';
export type CheckCategory = 'contract' | 'environment' | 'dependencies' | 'configuration';

export interface SanityCheck {
  id: string;
  name: string;
  description: string;
  category: CheckCategory;
  status: PipelineStatus;
  duration: number;
  lastRun?: Date;
  errorMessage?: string;
  warningMessage?: string;
  enabled: boolean;
}

export interface PipelineRun {
  id: string;
  startedAt: Date;
  finishedAt?: Date;
  status: PipelineStatus;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
}

export function toggleSanityCheck(checks: SanityCheck[], id: string): SanityCheck[] {
  return checks.map(check => 
    check.id === id ? { ...check, enabled: !check.enabled } : check
  );
}

export function calculatePipelineStats(checks: SanityCheck[]): {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  status: PipelineStatus;
} {
  const enabledChecks = checks.filter(c => c.enabled);
  if (enabledChecks.length === 0) {
    return {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
      status: 'idle'
    };
  }

  const passedChecks = enabledChecks.filter(c => c.status === 'passed').length;
  const failedChecks = enabledChecks.filter(c => c.status === 'failed').length;
  const warningChecks = enabledChecks.filter(c => c.status === 'warning').length;

  let status: PipelineStatus = 'passed';
  if (failedChecks > 0) {
    status = 'failed';
  } else if (warningChecks > 0) {
    status = 'warning';
  }

  return {
    totalChecks: enabledChecks.length,
    passedChecks,
    failedChecks,
    warningChecks,
    status
  };
}

export function createNewPipelineRun(checks: SanityCheck[], runId: string, startedAt: Date, finishedAt: Date): PipelineRun {
  const stats = calculatePipelineStats(checks);
  return {
    id: runId,
    startedAt,
    finishedAt,
    ...stats
  };
}
