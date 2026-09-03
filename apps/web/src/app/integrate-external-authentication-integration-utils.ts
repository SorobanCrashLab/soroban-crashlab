import type { SorobanAuthMode } from '../types';

// Re-exported from the shared contract-types module (../types) for backward
// compatibility — single source of truth lives in src/types/contracts.ts.
export type { SorobanAuthMode } from '../types';

export type AuthProviderType = 'stellar-wallet' | 'oauth' | 'api-key';
export type AuthProviderStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AuthProvider {
  id: string;
  type: AuthProviderType;
  label: string;
  description: string;
  status: AuthProviderStatus;
  identity?: string;
  errorMessage?: string;
  lastVerified?: string;
}

export interface AuthModeProbeResult {
  mode: SorobanAuthMode;
  status: 'ok' | 'diverged' | 'untested';
  notes?: string;
}

export interface ExternalAuthAdapter {
  connectProvider(provider: AuthProvider): Promise<AuthProvider>;
  disconnectProvider(provider: AuthProvider): Promise<AuthProvider>;
  probeAuthMode(mode: SorobanAuthMode): Promise<AuthModeProbeResult>;
}

type ExternalAuthAdapterOptions = {
  now?: () => string;
};

const PROVIDER_IDENTITIES: Record<AuthProviderType, string> = {
  'stellar-wallet': 'GAQX...KBTZ',
  oauth: 'contributor@example.com',
  'api-key': 'ci-fuzzer-key',
};

export function formatVerified(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `Verified ${d.toLocaleString()}`;
  } catch {
    return '';
  }
}

export function validateAuthProvider(provider: AuthProvider): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!provider.id) errors.push('Provider ID is required');
  if (!['stellar-wallet', 'oauth', 'api-key'].includes(provider.type)) {
    errors.push('Invalid provider type');
  }
  
  if (provider.status === 'connected') {
    if (!provider.identity) errors.push('Identity is required when connected');
    if (!provider.lastVerified) errors.push('Last verified timestamp is required when connected');
  }
  
  if (provider.status === 'error' && !provider.errorMessage) {
    errors.push('Error message is required when status is error');
  }
  
  return { isValid: errors.length === 0, errors };
}

export function createExternalAuthAdapter(
  options: ExternalAuthAdapterOptions = {},
): ExternalAuthAdapter {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async connectProvider(provider) {
      return {
        ...provider,
        status: 'connected',
        identity: provider.identity ?? PROVIDER_IDENTITIES[provider.type],
        errorMessage: undefined,
        lastVerified: now(),
      };
    },

    async disconnectProvider(provider) {
      return {
        ...provider,
        status: 'disconnected',
        identity: undefined,
        errorMessage: undefined,
        lastVerified: undefined,
      };
    },

    async probeAuthMode(mode) {
      return {
        mode,
        ...simulateAuthProbe(mode),
      };
    },
  };
}

export function simulateAuthProbe(mode: SorobanAuthMode): Omit<AuthModeProbeResult, 'mode'> {
  switch (mode) {
    case 'Enforce':
      return { status: 'ok', notes: 'All invocations authorised correctly.' };
    case 'Record':
      return { status: 'diverged', notes: 'Unexpected auth footprint in 2 seeds.' };
    case 'RecordAllowNonroot':
      return { status: 'ok', notes: 'Non-root auth recorded successfully.' };
    default:
      return { status: 'untested' };
  }
}
