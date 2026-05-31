export interface ReplayApiResponse {
    ok: boolean;
    runId: string;
    newRunId: string;
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
 * Invokes the replay API for a source run and returns the queued replay run id.
 */
export async function simulateSeedReplay(sourceRunId: string): Promise<{ newRunId: string }> {
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

    return { newRunId: payload.newRunId };
}
