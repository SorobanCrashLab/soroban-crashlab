export interface WebhookDeliveryHistoryItem {
  id: string;
  webhookId: string;
  url: string;
  eventType: 'run.started' | 'run.progressing' | 'run.completed' | 'run.failed' | 'run.cancelled' | 'crash.detected';
  /** `parked`: dead-lettered and past the automatic drain budget (#1635). */
  status: 'delivered' | 'failed' | 'queued' | 'parked';
  statusCode?: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastAttemptedAt?: string;
  nextRetryAt?: string;
  error?: string;
  payload: Record<string, unknown>;
  responseBody?: string;
  headers?: Record<string, string>;
}

export const MOCK_WEBHOOK_DELIVERY_HISTORY: WebhookDeliveryHistoryItem[] = [
  {
    id: 'del_1001',
    webhookId: 'wh_slack_01',
    url: 'https://example.com/webhooks/slack-incoming-placeholder',
    eventType: 'crash.detected',
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    payload: {
      event: 'crash.detected',
      runId: 'run_89f1a23',
      contractId: 'CABC1234567890DEF1234567890',
      crashType: 'PanicInHostFunction',
      severity: 'critical',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    responseBody: '{"ok": true}',
    headers: {
      'Content-Type': 'application/json',
      'X-CrashLab-Signature': 'sha256=a5b4c3d2e1f0...',
    },
  },
  {
    id: 'del_1002',
    webhookId: 'wh_discord_02',
    url: 'https://discord.com/api/webhooks/1234567890/abc123xyz_token',
    eventType: 'run.failed',
    status: 'failed',
    statusCode: 503,
    attempts: 3,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    error: 'HTTP 503 Service Unavailable: Discord API Gateway undergoing maintenance',
    payload: {
      event: 'run.failed',
      runId: 'run_44b9e11',
      totalInputs: 50000,
      failedInputs: 12,
      reason: 'TimeoutExceeded',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    responseBody: '{"message": "503 Service Unavailable", "code": 0}',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  {
    id: 'del_1003',
    webhookId: 'wh_custom_03',
    url: 'https://api.my-ops.internal/v1/fuzzing-alerts',
    eventType: 'run.failed',
    status: 'queued',
    statusCode: 500,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    nextRetryAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    error: 'HTTP 500 Internal Server Error',
    payload: {
      event: 'run.failed',
      runId: 'run_77a11bb',
      durationMs: 120500,
      status: 'failed',
    },
    responseBody: 'Internal Server Error',
  },
  {
    id: 'del_1004',
    webhookId: 'wh_slack_01',
    url: 'https://example.com/webhooks/slack-incoming-placeholder',
    eventType: 'run.completed',
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    payload: {
      event: 'run.completed',
      runId: 'run_1122334',
      coverage: '94.2%',
      inputsEvaluated: 100000,
    },
    responseBody: 'ok',
  },
  {
    id: 'del_1005',
    webhookId: 'wh_custom_04',
    url: 'https://analytics.company.com/webhook/soroban',
    eventType: 'run.started',
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    payload: {
      event: 'run.started',
      runId: 'run_9988776',
      target: 'SorobanTokenVault',
      workers: 8,
    },
    responseBody: '{"status":"received"}',
  },
  {
    id: 'del_1006',
    webhookId: 'wh_broken_endpoint',
    url: 'https://invalid-host-name-crashlab-test.org/webhook',
    eventType: 'crash.detected',
    status: 'failed',
    statusCode: 404,
    attempts: 3,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    lastAttemptedAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString(),
    error: 'ENOTFOUND: getaddrinfo ENOTFOUND invalid-host-name-crashlab-test.org',
    payload: {
      event: 'crash.detected',
      runId: 'run_0001122',
      crashType: 'StorageOverflow',
    },
  },
];
