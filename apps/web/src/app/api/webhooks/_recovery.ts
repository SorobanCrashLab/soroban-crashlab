import { getWebhookRecovery, type WebhookRecoveryTickResult } from '@/lib/webhook-recovery';
import { applyRecoveryResult } from '../../webhook-retry-dashboard-utils';
import { getDeliveryHistoryStore, updateDeliveryHistoryStore } from './history/route';

/**
 * One webhook-recovery pass (#1635): runs due retry jobs and drains the
 * dead-letter queue, then folds the outcomes into the delivery history the
 * retry dashboard reads. Shared by the schedules tick and the dashboard's
 * own recovery endpoint so both drive exactly the same loop.
 */
export async function runWebhookRecoveryPass(): Promise<WebhookRecoveryTickResult> {
  const result = await getWebhookRecovery().runTick();
  updateDeliveryHistoryStore(applyRecoveryResult(getDeliveryHistoryStore(), result));
  return result;
}
