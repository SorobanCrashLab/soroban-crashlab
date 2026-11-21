import type { DomainEvent } from '../DomainEvents';
import { getEventBus } from '../EventBus';

export async function publishCampaignEvent(type: 'CampaignCreated' | 'CampaignStarted' | 'CampaignPaused' | 'CampaignResumed' | 'CampaignCompleted' | 'CampaignFailed' | 'CampaignCancelled', campaignId: string, payload: Record<string, unknown>, idempotencyKey?: string): Promise<DomainEvent> {
  return getEventBus().publish({ type, aggregateId: campaignId, aggregateType: 'campaign', payload, ...(idempotencyKey ? { idempotencyKey } : {}) });
}
