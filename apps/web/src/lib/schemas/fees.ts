import { z } from 'zod';
import type { CampaignFeeInsight, RunFeeSummary } from '@/app/resource-fee-insight-utils';

const ThresholdsSchema = z.object({
  cpuWarning: z.number(),
  cpuCritical: z.number(),
  memoryWarning: z.number(),
  memoryCritical: z.number(),
  feeWarning: z.number(),
  feeCritical: z.number(),
});

const CrossingSchema = z.object({
  metric: z.enum(['cpu', 'memory', 'fee']),
  warningThreshold: z.number(),
  criticalThreshold: z.number(),
  warningCount: z.number(),
  criticalCount: z.number(),
  crossingCount: z.number(),
  total: z.number(),
  crossingRatio: z.number(),
});

const FixtureSchema = z.object({
  fixture: z.string(),
  runCount: z.number(),
  totalFee: z.number(),
  avgFee: z.number(),
  maxFee: z.number(),
  maxCpu: z.number(),
  maxMemory: z.number(),
  expensiveCount: z.number(),
  representativeRunId: z.string(),
  href: z.string(),
  statuses: z.record(z.string(), z.number()),
}).passthrough();

const TrendPointSchema = z.object({
  ts: z.number(),
  bucketStart: z.string(),
  runCount: z.number(),
  totalFee: z.number(),
  avgFee: z.number(),
  maxFee: z.number(),
  avgCpu: z.number(),
  avgMemory: z.number(),
  warningCount: z.number(),
  criticalCount: z.number(),
}).passthrough();

/**
 * Response contract for GET /api/campaigns/[id]/fees. Nested histogram and
 * threshold payloads use passthrough so additive W5-A12 fields stay readable.
 */
export const CampaignFeeInsightSchema = z.object({
  campaignId: z.string(),
  runCount: z.number(),
  runsWithFeeData: z.number(),
  runsWithoutFeeData: z.number(),
  coverage: z.object({
    envelope: z.number(),
    legacy: z.number(),
    absent: z.number(),
  }),
  hasFeeData: z.boolean(),
  thresholds: ThresholdsSchema,
  histograms: z.record(z.string(), z.unknown()),
  thresholdCrossings: z.object({
    cpu: CrossingSchema,
    memory: CrossingSchema,
    fee: CrossingSchema,
    total: z.number(),
  }),
  expensiveFixtures: z.array(FixtureSchema),
  trend: z.array(TrendPointSchema),
  trendDownsampled: z.boolean(),
  trendBucketMs: z.number(),
  totals: z.object({
    totalCpu: z.number(),
    avgCpu: z.number(),
    maxCpu: z.number(),
    totalMemory: z.number(),
    avgMemory: z.number(),
    maxMemory: z.number(),
    totalFee: z.number(),
    avgFee: z.number(),
    maxFee: z.number(),
  }),
  expensiveSuccessCount: z.number(),
  expensiveFailureCount: z.number(),
}).passthrough() as z.ZodType<CampaignFeeInsight>;

export const RunFeeSummarySchema = z.object({
  runId: z.string(),
  campaignId: z.string().optional(),
  fixture: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  source: z.enum(['envelope', 'legacy', 'absent']),
  hasFeeData: z.boolean(),
  cpuInstructions: z.number().nullable(),
  memoryBytes: z.number().nullable(),
  minResourceFee: z.number().nullable(),
  feeWarnThreshold: z.number(),
  levels: z.object({
    cpu: z.enum(['normal', 'warning', 'critical', 'unknown']),
    memory: z.enum(['normal', 'warning', 'critical', 'unknown']),
    fee: z.enum(['normal', 'warning', 'critical', 'unknown']),
    overall: z.enum(['normal', 'warning', 'critical', 'unknown']),
  }),
  thresholdCrossings: z.array(CrossingSchema),
  expensiveSuccess: z.boolean(),
  expensiveFailure: z.boolean(),
  href: z.string(),
  campaignHref: z.string().optional(),
}).passthrough() as z.ZodType<RunFeeSummary>;

export const CampaignFeeInsightEnvelopeSchema = z.object({
  data: CampaignFeeInsightSchema,
}).passthrough();

export const RunFeeSummaryEnvelopeSchema = z.object({
  data: RunFeeSummarySchema,
}).passthrough();
