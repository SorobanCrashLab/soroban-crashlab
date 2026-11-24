export interface SecretVersion {
  version: string;
  createdAt: string;
  status: 'pending' | 'active' | 'retiring' | 'revoked';
}

export interface SecretProvider {
  get(input: {
    tenantId: string;
    integrationId: string;
    name: string;
    version?: string;
  }): Promise<Uint8Array>;

  put(input: {
    tenantId: string;
    integrationId: string;
    name: string;
    value: Uint8Array;
  }): Promise<{ version: string }>;

  revoke(input: {
    tenantId: string;
    integrationId: string;
    name: string;
    version: string;
  }): Promise<void>;

  listVersions(input: {
    tenantId: string;
    integrationId: string;
    name: string;
  }): Promise<SecretVersion[]>;
}
