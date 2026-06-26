import { NextRequest, NextResponse } from 'next/server';
import { WebhookConfig, RunEventType } from '@/app/webhook-manager';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

const VALID_PROTOCOLS = new Set(['http:', 'https:']);

const VALID_EVENT_TYPES = new Set<RunEventType>([
  'run.started',
  'run.progressing',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'crash.detected',
]);

// In-memory store (persists for the lifetime of the process)
const store = new Map<string, WebhookConfig>();

function isValidUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return VALID_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isRunEventType(value: unknown): value is RunEventType {
  return typeof value === 'string' && VALID_EVENT_TYPES.has(value as RunEventType);
}

function parseWebhookBody(body: unknown): WebhookConfig | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    return { error: 'Field "id" must be a non-empty string.' };
  }

  if (!isValidUrl(raw.url)) {
    return { error: 'Field "url" must be a valid http or https URL.' };
  }

  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    return { error: 'Field "events" must be a non-empty array.' };
  }

  if (!raw.events.every(isRunEventType)) {
    return {
      error: `Field "events" contains invalid event types. Allowed: ${[...VALID_EVENT_TYPES].join(', ')}.`,
    };
  }

  if (typeof raw.active !== 'boolean') {
    return { error: 'Field "active" must be a boolean.' };
  }

  const config: WebhookConfig = {
    id: raw.id.trim(),
    url: raw.url,
    events: raw.events as RunEventType[],
    active: raw.active,
  };

  if (raw.secret !== undefined) {
    if (typeof raw.secret !== 'string') {
      return { error: 'Field "secret" must be a string when provided.' };
    }
    config.secret = raw.secret;
  }

  if (raw.maxRetries !== undefined) {
    if (typeof raw.maxRetries !== 'number' || !Number.isInteger(raw.maxRetries) || raw.maxRetries < 0) {
      return { error: 'Field "maxRetries" must be a non-negative integer when provided.' };
    }
    config.maxRetries = raw.maxRetries;
  }

  if (raw.timeoutMs !== undefined) {
    if (typeof raw.timeoutMs !== 'number' || !Number.isInteger(raw.timeoutMs) || raw.timeoutMs <= 0) {
      return { error: 'Field "timeoutMs" must be a positive integer when provided.' };
    }
    config.timeoutMs = raw.timeoutMs;
  }

  if (raw.headers !== undefined) {
    if (
      typeof raw.headers !== 'object' ||
      raw.headers === null ||
      Array.isArray(raw.headers) ||
      !Object.values(raw.headers as object).every((v) => typeof v === 'string')
    ) {
      return { error: 'Field "headers" must be a flat object of string values when provided.' };
    }
    config.headers = raw.headers as Record<string, string>;
  }

  return config;
}

/**
 * GET /api/webhooks
 * Returns all registered webhook configurations.
 */
export const GET = withRouteErrorHandling('GET /api/webhooks', async () => {
  const webhooks = [...store.values()].map((wh) => ({
    ...wh,
    secret: wh.secret !== undefined ? '***' : undefined,
  }));
  return NextResponse.json({ webhooks, total: webhooks.length });
});

/**
 * POST /api/webhooks
 * Registers a new webhook. Body: WebhookConfig JSON.
 */
export const POST = withRouteErrorHandling('POST /api/webhooks', async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const result = parseWebhookBody(parsedBody.body);
  if ('error' in result) {
    return jsonError(result.error, 422);
  }

  if (store.has(result.id)) {
    return jsonError(`Webhook with id "${result.id}" already exists.`, 409);
  }

  const stored: WebhookConfig = {
    ...result,
    maxRetries: result.maxRetries ?? 3,
    timeoutMs: result.timeoutMs ?? 5000,
  };
  store.set(stored.id, stored);

  return NextResponse.json(
    { ...stored, secret: stored.secret !== undefined ? '***' : undefined },
    { status: 201 },
  );
});

/**
 * DELETE /api/webhooks?id=<webhookId>
 * Removes a registered webhook by id.
 */
export const DELETE = withRouteErrorHandling('DELETE /api/webhooks', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return jsonError('Query parameter "id" is required.', 400);
  }

  if (!store.has(id)) {
    return jsonError(`Webhook "${id}" not found.`, 404);
  }

  store.delete(id);
  return NextResponse.json({ deleted: id });
});

/**
 * PATCH /api/webhooks?id=<webhookId>
 * Updates an existing webhook. Body: partial WebhookConfig fields.
 */
export const PATCH = withRouteErrorHandling('PATCH /api/webhooks', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return jsonError('Query parameter "id" is required.', 400);
  }

  const existing = store.get(id);
  if (!existing) {
    return jsonError(`Webhook "${id}" not found.`, 404);
  }

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;
  const body = parsedBody.body;

  if (typeof body !== 'object' || body === null) {
    return jsonError('Request body must be a JSON object.', 400);
  }

  const patch = body as Record<string, unknown>;
  const updated: WebhookConfig = { ...existing };

  if ('url' in patch) {
    if (!isValidUrl(patch.url)) {
      return jsonError('Field "url" must be a valid http or https URL.', 422);
    }
    updated.url = patch.url;
  }

  if ('events' in patch) {
    if (!Array.isArray(patch.events) || patch.events.length === 0 || !patch.events.every(isRunEventType)) {
      return jsonError('Field "events" must be a non-empty array of valid event types.', 422);
    }
    updated.events = patch.events as RunEventType[];
  }

  if ('active' in patch) {
    if (typeof patch.active !== 'boolean') {
      return jsonError('Field "active" must be a boolean.', 422);
    }
    updated.active = patch.active;
  }

  if ('secret' in patch) {
    if (patch.secret !== null && typeof patch.secret !== 'string') {
      return jsonError('Field "secret" must be a string or null.', 422);
    }
    updated.secret = patch.secret === null ? undefined : (patch.secret as string);
  }

  if ('maxRetries' in patch) {
    if (
      typeof patch.maxRetries !== 'number' ||
      !Number.isInteger(patch.maxRetries) ||
      patch.maxRetries < 0
    ) {
      return jsonError('Field "maxRetries" must be a non-negative integer.', 422);
    }
    updated.maxRetries = patch.maxRetries;
  }

  if ('timeoutMs' in patch) {
    if (
      typeof patch.timeoutMs !== 'number' ||
      !Number.isInteger(patch.timeoutMs) ||
      patch.timeoutMs <= 0
    ) {
      return jsonError('Field "timeoutMs" must be a positive integer.', 422);
    }
    updated.timeoutMs = patch.timeoutMs;
  }

  if ('headers' in patch) {
    if (
      patch.headers !== null &&
      (typeof patch.headers !== 'object' ||
        Array.isArray(patch.headers) ||
        !Object.values(patch.headers as object).every((v) => typeof v === 'string'))
    ) {
      return jsonError('Field "headers" must be a flat object of string values or null.', 422);
    }
    updated.headers =
      patch.headers === null ? undefined : (patch.headers as Record<string, string>);
  }

  store.set(id, updated);

  return NextResponse.json({
    ...updated,
    secret: updated.secret !== undefined ? '***' : undefined,
  });
});
