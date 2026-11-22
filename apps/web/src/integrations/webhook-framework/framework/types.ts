/** Types for the generic webhook plugin framework (issue #2204). */

export type WebhookEventType =
  | 'crash.created'
  | 'run.completed'
  | 'campaign.started'
  | 'dlq.growth';

export interface WebhookEvent {
  type: WebhookEventType;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface Trigger {
  events: WebhookEventType[];
  /** Optional dotted-path equality filters, e.g. { "payload.campaign": "mainnet-fuzz" }. */
  filter?: Record<string, unknown>;
}

export type TransformStep =
  | { kind: 'pick'; path: string; as: string }
  | { kind: 'template'; template: string; as: string }
  | { kind: 'constant'; value: unknown; as: string };

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  triggers: Trigger[];
  endpoint: string;
  transform?: TransformStep[];
  enabled?: boolean;
}

export interface DeliveryRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
}

export interface WebhookPlugin {
  manifest: PluginManifest;
  transform: (event: WebhookEvent) => Record<string, unknown>;
  deliver: (
    request: DeliveryRequest,
    fetchImpl?: (url: string, init: unknown) => Promise<{ status: number }>,
  ) => Promise<DeliveryResult>;
}

export interface TestCase {
  name: string;
  pluginId: string;
  event: WebhookEvent;
  createdAt: string;
}
