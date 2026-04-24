/**
 * Simulates scheduling a seed replay for the dashboard (no backend in this demo).
 */
export async function simulateSeedReplay(sourceRunId: string): Promise<{ newRunId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return { newRunId: `replay-${sourceRunId}-${suffix}` };
}
