import { z } from 'zod';

/** Stable names are wire contracts; add new names rather than renaming old ones. */
export const DOMAIN_EVENT_TYPES = [
  'RunCreated', 'RunStarted', 'RunProgressed', 'RunCompleted', 'RunFailed', 'RunCancelled', 'RunDeleted',
  'CrashDetected', 'CrashReproduced', 'CrashResolved', 'CrashRegressed', 'ArtifactCreated', 'ArtifactDeleted',
  'CampaignCreated', 'CampaignStarted', 'CampaignPaused', 'CampaignResumed', 'CampaignCompleted', 'CampaignFailed', 'CampaignCancelled',
  'TriageItemCreated', 'TriageAssigned', 'TriageStatusChanged', 'TriageCompleted', 'TriageCommentAdded', 'TriageLabelChanged',
  'ReplayRequested', 'ReplayStarted', 'ReplayCompleted', 'ReplayFailed', 'ReplayCancelled',
  'WebhookRegistered', 'WebhookUpdated', 'WebhookDeleted', 'WebhookDeliveryQueued', 'WebhookDelivered', 'WebhookDeliveryFailed',
  'NotificationCreated', 'NotificationRead', 'SearchDocumentUpdated', 'SearchDocumentRemoved',
  'ProjectCreated', 'ProjectUpdated', 'ProjectDeleted', 'ContractRegistered', 'ContractUpdated', 'ContractDeleted',
  'ScheduleCreated', 'ScheduleUpdated', 'ScheduleDeleted', 'ScheduleTriggered', 'UserInvited', 'UserRoleChanged',
  'SettingsUpdated', 'AnnotationCreated', 'AnnotationUpdated', 'AnnotationDeleted', 'TagAdded', 'TagRemoved',
] as const;

export const DomainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export const DomainEventSchema = z.object({
  id: z.string().min(1),
  type: DomainEventTypeSchema,
  version: z.number().int().positive(),
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  aggregateId: z.string().min(1),
  aggregateType: z.string().min(1),
  idempotencyKey: z.string().optional(),
  correlationId: z.string().optional(),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type NewDomainEvent = Omit<DomainEvent, 'id' | 'sequence' | 'occurredAt' | 'version'> & {
  id?: string;
  sequence?: number;
  occurredAt?: string;
  version?: number;
};
