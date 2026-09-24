import { z } from 'zod';
import {
  AnalyticsEventsResponseSchema,
  AnalyticsTrendsResponseSchema,
  RunIssueLinkSchema,
  WebhookHistoryResponseSchema,
} from './runs';

export const RunIssuesResponseSchema = z.object({
  runId: z.string(),
  issues: z.array(RunIssueLinkSchema),
}).passthrough();

export const RunTagsResponseSchema = z.object({
  runId: z.string().optional(),
  tags: z.array(z.string()),
}).passthrough();

export const RunAnnotationsResponseSchema = z.object({
  runId: z.string().optional(),
  annotations: z.array(z.string()),
}).passthrough();

export const ArtifactMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  sizeBytes: z.number(),
}).passthrough();

export const ArtifactsResponseSchema = z.object({
  artifacts: z.array(ArtifactMetadataSchema),
  total: z.number(),
}).passthrough();

export const RemoveArtifactResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
}).passthrough();

export const CampaignResponseSchema = z.object({
  campaign: z.record(z.unknown()),
}).passthrough();

export const NotificationFeedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'success', 'warning', 'error']),
  createdAt: z.string(),
  read: z.boolean(),
}).passthrough();

export const NotificationsResponseSchema = z.object({
  notifications: z.array(NotificationFeedItemSchema),
  total: z.number(),
}).passthrough();

export const WebhookConfigSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  active: z.boolean(),
  secret: z.string().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  headers: z.record(z.string()).optional(),
}).passthrough();

export const WebhooksResponseSchema = z.object({
  webhooks: z.array(WebhookConfigSchema),
  total: z.number().optional(),
}).passthrough();

export const IntegrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export const IntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationSchema),
}).passthrough();

export type RunIssuesResponse = z.infer<typeof RunIssuesResponseSchema>;
export type RunTagsResponse = z.infer<typeof RunTagsResponseSchema>;
export type RunAnnotationsResponse = z.infer<typeof RunAnnotationsResponseSchema>;
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;
export type ArtifactsResponse = z.infer<typeof ArtifactsResponseSchema>;
export type CampaignResponse = z.infer<typeof CampaignResponseSchema>;
export type NotificationFeedItem = z.infer<typeof NotificationFeedItemSchema>;
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;
export type Integration = z.infer<typeof IntegrationSchema>;
export type IntegrationsResponse = z.infer<typeof IntegrationsResponseSchema>;

export {
  AnalyticsEventsResponseSchema,
  AnalyticsTrendsResponseSchema,
  WebhookHistoryResponseSchema,
};
