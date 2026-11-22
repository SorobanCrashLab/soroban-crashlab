export type CostEstimate = {
  runCount: number;
  avgFeeStroops: number;
  totalStroops: number;
  totalXlm: number;
  dailyBurnStroops: number;
  dailyBurnXlm: number;
  projected7dStroops: number;
  projected30dStroops: number;
};

const STROOPS_PER_XLM = 10_000_000;

export function estimateCampaignCost(runCount: number, avgFeeStroops: number, runsPerDay = 50): CostEstimate {
  const totalStroops = runCount * avgFeeStroops;
  const dailyBurnStroops = runsPerDay * avgFeeStroops;
  return {
    runCount,
    avgFeeStroops,
    totalStroops,
    totalXlm: totalStroops / STROOPS_PER_XLM,
    dailyBurnStroops,
    dailyBurnXlm: dailyBurnStroops / STROOPS_PER_XLM,
    projected7dStroops: dailyBurnStroops * 7,
    projected30dStroops: dailyBurnStroops * 30,
  };
}

export function formatStroops(stroops: number): string {
  if (stroops >= STROOPS_PER_XLM) return `${(stroops / STROOPS_PER_XLM).toFixed(4)} XLM (${stroops.toLocaleString()} stroops)`;
  return `${stroops.toLocaleString()} stroops`;
}
