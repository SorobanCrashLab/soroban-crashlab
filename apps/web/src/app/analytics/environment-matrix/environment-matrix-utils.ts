export type MockNetworkConfig = {
  id: string;
  name: string;
  rpcUrl: string;
  passphrase: string;
};

export type MatrixRunResult = {
  runId: string;
  status: 'completed' | 'failed' | 'running';
  signature?: string;
  durationMs: number;
};

export type MatrixRow = {
  runId: string;
  results: Record<string, MatrixRunResult>;
  diverged: boolean;
};

export const MOCK_MATRIX_NETWORKS: MockNetworkConfig[] = [
  { id: 'testnet', name: 'Testnet', rpcUrl: 'https://soroban-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
  { id: 'futurenet', name: 'Futurenet', rpcUrl: 'https://rpc-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
  { id: 'local', name: 'Local', rpcUrl: 'http://localhost:8000', passphrase: 'Standalone Network ; February 2017' },
];

export function buildMatrixRows(runIds: string[], seed?: number): MatrixRow[] {
  return runIds.map((runId) => {
    const results: Record<string, MatrixRunResult> = {};
    let firstStatus: string | null = null;
    let diverged = false;
    for (const net of MOCK_MATRIX_NETWORKS) {
      const hash = hashString(`${runId}:${net.id}:${seed ?? 0}`);
      const status: MatrixRunResult['status'] = hash % 7 === 0 ? 'failed' : hash % 11 === 0 ? 'running' : 'completed';
      results[net.id] = { runId, status, signature: status === 'failed' ? `sig:${hash % 100}` : undefined, durationMs: 800 + (hash % 1200) };
      if (firstStatus === null) firstStatus = status;
      else if (status !== firstStatus) diverged = true;
    }
    return { runId, results, diverged };
  });
}

export function computeDivergenceReport(rows: MatrixRow[]): { total: number; diverged: number; divergedIds: string[] } {
  const divergedRows = rows.filter((r) => r.diverged);
  return { total: rows.length, diverged: divergedRows.length, divergedIds: divergedRows.map((r) => r.runId) };
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}
