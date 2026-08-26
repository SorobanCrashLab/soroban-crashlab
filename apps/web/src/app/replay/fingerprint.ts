export interface ReplayFingerprintComponents {
  seedSet: string;
  contractWasmHash: string;
  engineVersion: string;
  networkConfigHash: string;
}

export type VerificationState = 'match' | 'mismatch' | 'unknown';

export interface ReplayFingerprint {
  composite: string;
  components: ReplayFingerprintComponents;
  stampedAt: string;
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map(canonicalStringify).join(',');
    return `[${items}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`,
    );
    return `{${pairs.join(',')}}`;
  }
  return String(value);
}

export function canonicalize(value: unknown): string {
  return canonicalStringify(value);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeFingerprint(
  components: ReplayFingerprintComponents,
): Promise<ReplayFingerprint> {
  const seedHash = await sha256Hex(canonicalize(components.seedSet));
  const contractHash = await sha256Hex(canonicalize(components.contractWasmHash));
  const engineHash = await sha256Hex(canonicalize(components.engineVersion));
  const networkHash = await sha256Hex(canonicalize(components.networkConfigHash));

  const composite = await sha256Hex(
    canonicalize({ seedHash, contractHash, engineHash, networkHash }),
  );

  return {
    composite,
    components: {
      seedSet: seedHash,
      contractWasmHash: contractHash,
      engineVersion: engineHash,
      networkConfigHash: networkHash,
    },
    stampedAt: new Date().toISOString(),
  };
}

export async function verifyFingerprint(
  original: ReplayFingerprint | undefined,
  current: ReplayFingerprintComponents,
): Promise<VerificationState> {
  if (!original) return 'unknown';
  const currentFp = await computeFingerprint(current);
  if (original.composite === currentFp.composite) return 'match';
  return 'mismatch';
}

export const FINGERPRINT_PARTICIPANTS: Array<{ key: keyof ReplayFingerprintComponents; label: string }> = [
  { key: 'seedSet', label: 'Seed Set' },
  { key: 'contractWasmHash', label: 'Contract WASM' },
  { key: 'engineVersion', label: 'Engine Version' },
  { key: 'networkConfigHash', label: 'Network Config' },
];
