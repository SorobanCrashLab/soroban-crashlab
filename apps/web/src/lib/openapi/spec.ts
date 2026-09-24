/**
 * lib/openapi/spec — OpenAPI 3.1 document builder (#1670).
 * Pure function of ROUTE_REGISTRY + zod schemas; rendered statically by
 * app/api-docs/page.tsx and served as JSON by app/api/openapi/route.ts.
 */

import { ROUTE_REGISTRY } from './registry';
import { zodToJsonSchema } from './zod-to-json-schema';
import {
  CrashDetailSchema,
  FuzzingRunSchema,
  RunsListRequestSchema,
  RunsListResponseSchema,
} from '../schemas/runs';
import { ERROR_CODES } from '../error-codes';

export const OPENAPI_VERSION = '3.1.0';

function errorSchemaFor(code: string) {
  const entry = (ERROR_CODES as Record<string, { message: string; httpStatus: number }>)[code];
  return {
    type: 'object',
    properties: {
      error: { type: 'string', example: entry?.message ?? code },
      code: { type: 'string', example: code },
    },
    required: ['error', 'code'],
  };
}

export function buildOpenApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of ROUTE_REGISTRY) {
    const method = route.method.toLowerCase();
    paths[route.path] = paths[route.path] ?? {};
    paths[route.path][method] = {
      summary: route.summary,
      description: route.description,
      tags: route.tags,
      security: route.auth === 'none' ? [] : [{ bearerAuth: route.scopes ?? [] }],
      parameters:
        route.path.includes('{id}') || route.paginated
          ? [
              ...(route.path.includes('{id}')
                ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
                : []),
              ...(route.paginated
                ? [
                    { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
                    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20 } },
                  ]
                : []),
            ]
          : [],
      responses: {
        '200': {
          description: 'Success envelope { data, total? }',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessEnvelope' },
            },
          },
        },
        ...Object.fromEntries(
          route.errorCodes.map((code) => [
            String(
              (ERROR_CODES as Record<string, { httpStatus: number }>)[code]?.httpStatus ?? 400,
            ),
            {
              description: code,
              content: {
                'application/json': { schema: errorSchemaFor(code) },
              },
            },
          ]),
        ),
      },
    };
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Soroban CrashLab API',
      version: '1.0.0',
      description:
        'Machine-readable contract for the CrashLab API. Global envelope: success is { data, total? }; errors are { error, code?, fieldErrors? }. Auth: `Authorization: Bearer <token>` with scopes `read`/`write` (tokens look like `scl_live_*`); maintainer-only routes additionally require role `maintainer`. Pagination is keyset-based via opaque `cursor` + `limit`.',
    },
    servers: [{ url: '/' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'runs', description: 'Fuzzing runs, replay, tags, annotations, issues' },
      { name: 'artifacts', description: 'Artifact bundles and validation' },
      { name: 'campaigns', description: 'Fuzz campaigns' },
      { name: 'schedules', description: 'Scheduled campaigns' },
      { name: 'webhooks', description: 'Webhooks and delivery history' },
      { name: 'notifications', description: 'Notifications' },
      { name: 'networks', description: 'Stellar networks' },
      { name: 'settings', description: 'Tokens and alerting' },
      { name: 'auth', description: 'OAuth flows (no bearer required)' },
      { name: 'integrations', description: 'Slack/Discord/GitHub/Jira/SMTP/PagerDuty/Datadog' },
      { name: 'ops', description: 'Health and metrics' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API token (`scl_live_*`) or scrape token. 401 { error, code } on missing/invalid; 403 on insufficient scope/role.',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: { data: {}, total: { type: 'number' } },
          required: ['data'],
        },
        ErrorEnvelope: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
        CodedErrorEnvelope: {
          type: 'object',
          properties: { error: { type: 'string' }, code: { type: 'string' } },
          required: ['error', 'code'],
        },
        FuzzingRun: zodToJsonSchema(FuzzingRunSchema),
        CrashDetail: zodToJsonSchema(CrashDetailSchema),
        RunsListRequest: zodToJsonSchema(RunsListRequestSchema),
        RunsListResponse: zodToJsonSchema(RunsListResponseSchema),
      },
    },
  };
}

export type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;
