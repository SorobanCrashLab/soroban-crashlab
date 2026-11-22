export interface SecretMetadata {
  id: string;
  tenantId: string;
  integrationId: string;
  name: string;
  provider: 'vault' | 'aws-kms' | 'gcp-secret-manager' | 'env';
  activeVersion: string;
  updatedAt: string;
}

export interface SecretRepository {
  list(tenantId: string): Promise<SecretMetadata[]>;
  create(input: {
    tenantId: string;
    integrationId: string;
    name: string;
    provider: SecretMetadata['provider'];
    encryptedValue: unknown;
    version: string;
  }): Promise<SecretMetadata>;
}

export class SecretManager {
  constructor(private readonly repository: SecretRepository) {}

  listMasked(tenantId: string): Promise<SecretMetadata[]> {
    if (!tenantId) throw new Error('Tenant scope is required');
    return this.repository.list(tenantId);
  }
}
