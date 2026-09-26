import { NextRequest } from 'next/server';
import { WebhookConfig, RunEventType } from '@/app/webhook-manager';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, createdResponse } from '@/lib/api-response-utils';
import { getWebhookStore } from '@/lib/webhook-store';
import { validateWebhookApiKey } from '@/lib/api-key-auth';
import { WEBHOOK_DELIVERY_TIMEOUT_MS } from '@/lib/timeouts';
import { sanitizeSearchParams } from '@/lib/sanitize';
import { logger } from '@/lib/logger';

const store = getWebhookStore();



import { WebhookCreateSchema, WebhookUpdateSchema } from '@/lib/schemas/integrations/webhooks';

/**
 * GET /api/webhooks
 * Returns all registered webhook configurations.
 */
export const GET = withRouteErrorHandling('GET /api/webhooks', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;

  const webhooks = store.getAllConfigs().map((wh) => ({
    ...wh,
    secret: wh.secret !== undefined ? '***' : undefined,
  }));
  return successResponse({ webhooks, total: webhooks.length }, { total: webhooks.length });
});

/**
 * POST /api/webhooks
 * Registers a new webhook. Body: WebhookConfig JSON.
 */
export const POST = withRouteErrorHandling('POST /api/webhooks', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const validation = WebhookCreateSchema.safeParse(parsedBody.body);
  if (!validation.success) {
    logger.warn('Webhook payload validation failed', { 
      provider: 'webhooks', 
      reason: validation.error.message 
    });
    return jsonError('Invalid webhook configuration', 422);
  }
  const result = validation.data;

  if (store.hasConfig(result.id)) {
    return jsonError(`Webhook with id "${result.id}" already exists.`, 409);
  }

  const stored: WebhookConfig = {
    ...result,
    events: result.events as RunEventType[],
    maxRetries: result.maxRetries ?? 3,
    timeoutMs: result.timeoutMs ?? WEBHOOK_DELIVERY_TIMEOUT_MS,
  };
  store.setConfig(stored);

  return createdResponse({
    ...stored,
    secret: stored.secret !== undefined ? '***' : undefined,
  });
});

/**
 * DELETE /api/webhooks?id=<webhookId>
 * Removes a registered webhook by id.
 */
export const DELETE = withRouteErrorHandling('DELETE /api/webhooks', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;

  const searchParams = sanitizeSearchParams(new URL(request.url).searchParams);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return jsonError('Query parameter "id" is required.', 400);
  }

  if (!store.hasConfig(id)) {
    return jsonError(`Webhook "${id}" not found.`, 404);
  }

  store.deleteConfig(id);
  return successResponse({ deleted: id });
});

/**
 * PATCH /api/webhooks?id=<webhookId>
 * Updates an existing webhook. Body: partial WebhookConfig fields.
 */
export const PATCH = withRouteErrorHandling('PATCH /api/webhooks', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;

  const searchParams = sanitizeSearchParams(new URL(request.url).searchParams);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return jsonError('Query parameter "id" is required.', 400);
  }

  const existing = store.getConfig(id);
  if (!existing) {
    return jsonError(`Webhook "${id}" not found.`, 404);
  }

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;
  const body = parsedBody.body;

  if (typeof body !== 'object' || body === null) {
    return jsonError('Request body must be a JSON object.', 400);
  }

  const validation = WebhookUpdateSchema.safeParse(body);
  if (!validation.success) {
    logger.warn('Webhook payload validation failed', { 
      provider: 'webhooks', 
      reason: validation.error.message 
    });
    return jsonError('Invalid webhook patch payload', 422);
  }

  const patch = validation.data;
  const updated: WebhookConfig = { ...existing };

  if (patch.url !== undefined) updated.url = patch.url;
  if (patch.events !== undefined) updated.events = patch.events as RunEventType[];
  if (patch.active !== undefined) updated.active = patch.active;
  if (patch.secret !== undefined) updated.secret = patch.secret === null ? undefined : patch.secret;
  if (patch.maxRetries !== undefined) updated.maxRetries = patch.maxRetries;
  if (patch.timeoutMs !== undefined) updated.timeoutMs = patch.timeoutMs;
  if (patch.headers !== undefined) updated.headers = patch.headers === null ? undefined : patch.headers;

  store.setConfig(updated);

  return successResponse({
    ...updated,
    secret: updated.secret !== undefined ? '***' : undefined,
  });
});
