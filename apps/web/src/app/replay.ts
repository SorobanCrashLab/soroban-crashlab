export interface ReplayApiResponse {
    ok: boolean;
    runId: string;
    newRunId: string;
    parentId?: string;
    seedList?: number[];
    command: string;
    args: string[];
    stdout: string;
    stderr: string;
    exitCode: number;
    bundleJson: string;
    error?: string;
}

interface ReplayApiErrorResponse {
    ok?: false;
    error?: string;
}

function isReplayApiResponse(payload: unknown): payload is ReplayApiResponse {
    if (typeof payload !== 'object' || payload === null) {
        return false;
    }

    const record = payload as Record<string, unknown>;
    return (
        record.ok === true &&
        typeof record.newRunId === 'string' &&
        typeof record.runId === 'string' &&
        typeof record.command === 'string' &&
        Array.isArray(record.args) &&
        typeof record.stdout === 'string' &&
        typeof record.stderr === 'string' &&
        typeof record.exitCode === 'number' &&
        typeof record.bundleJson === 'string'
    );
}

async function readReplayApiError(response: Response): Promise<string | null> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        try {
            const payload = (await response.json()) as ReplayApiErrorResponse;
            if (typeof payload.error === 'string' && payload.error.trim()) {
                return payload.error;
            }
        } catch {
            return null;
        }
    }

    try {
        const text = await response.text();
        return text.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Normalizes a seed selection into a sorted deduplicated list for child replays.
 */
export function normalizeSeedList(seedList?: number[] | null): number[] {
    if (!Array.isArray(seedList)) {
        return [];
    }

    const numbers = seedList
        .map((seed) => Number(seed))
        .filter((seed) => Number.isInteger(seed) && seed >= 0);

    return [...new Set(numbers)].sort((a, b) => a - b);
}

export function buildDeterministicReplayRunId(
    sourceRunId: string,
    selectedSeeds?: number[] | null,
    parentId?: string,
): string {
    const normalized = normalizeSeedList(selectedSeeds);
    const digest = normalized.length > 0 ? normalized.join('-') : 'all';
    const lineage = parentId ? `-${parentId}` : '';
    return `replay-${sourceRunId}${lineage}-seed-${digest}`;
}

/**
 * Invokes the replay API for a source run and returns the queued replay run id.
 * When a subset of failing seeds is supplied, the result is returned deterministically
 * without depending on the backend so tests and mock UIs can reason about the lineage.
 */
export async function simulateSeedReplay(
    sourceRunId: string,
    seedList?: number[] | null,
    parentId?: string,
): Promise<{ newRunId: string; parentId?: string; seedList: number[] }> {
    const normalized = normalizeSeedList(seedList);

    if (seedList !== undefined && seedList !== null) {
        const newRunId = buildDeterministicReplayRunId(sourceRunId, normalized, parentId);
        return {
            newRunId,
            parentId: parentId ?? undefined,
            seedList: normalized,
        };
    }

    const response = await fetch(`/api/runs/${encodeURIComponent(sourceRunId)}/replay`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
        },
    });

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok || !isReplayApiResponse(payload)) {
        const errorMessage = await readReplayApiError(response);
        throw new Error(
            errorMessage
                ? errorMessage
                : `Replay request failed with HTTP ${response.status}`,
        );
    }

    return {
        newRunId: payload.newRunId,
        parentId: payload.parentId,
        seedList: normalizeSeedList(payload.seedList ?? []),
    };
}
