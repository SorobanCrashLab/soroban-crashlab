// Issue #1842: Boot-time configuration validation with actionable failure messages
// Central registry and validation for all environment variables

export interface EnvVarSchema {
  key: string;
  required: boolean;
  format?: 'url' | 'boolean' | 'number' | 'string';
  secret?: boolean;
  defaultValue?: string;
  description: string;
}

export interface ValidationError {
  key: string;
  problem: string;
  suggestion: string;
}

// Central registry of all environment variables
export const ENV_SCHEMA: EnvVarSchema[] = [
  {
    key: 'KV_REST_API_URL',
    required: true,
    format: 'url',
    secret: false,
    description: 'Vercel KV REST API endpoint for key-value storage',
  },
  {
    key: 'KV_REST_API_TOKEN',
    required: true,
    secret: true,
    description: 'Vercel KV authentication token',
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    required: true,
    format: 'url',
    secret: false,
    description: 'Public-facing application URL for redirects and links',
  },
  {
    key: 'DATABASE_URL',
    required: true,
    format: 'url',
    secret: true,
    description: 'PostgreSQL connection string',
  },
  {
    key: 'STORAGE_BACKEND',
    required: false,
    defaultValue: 'mock',
    description: 'Storage backend: "s3", "minio", or "mock"',
  },
  {
    key: 'S3_BUCKET',
    required: false,
    description: 'S3 bucket name (required if STORAGE_BACKEND=s3)',
  },
  {
    key: 'S3_REGION',
    required: false,
    description: 'S3 region (required if STORAGE_BACKEND=s3)',
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    required: false,
    secret: true,
    description: 'AWS credentials (required if STORAGE_BACKEND=s3)',
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    required: false,
    secret: true,
    description: 'AWS credentials (required if STORAGE_BACKEND=s3)',
  },
  {
    key: 'MINIO_ENDPOINT',
    required: false,
    format: 'url',
    description: 'MinIO endpoint (required if STORAGE_BACKEND=minio)',
  },
  {
    key: 'MINIO_ACCESS_KEY',
    required: false,
    secret: true,
    description: 'MinIO credentials (required if STORAGE_BACKEND=minio)',
  },
  {
    key: 'MINIO_SECRET_KEY',
    required: false,
    secret: true,
    description: 'MinIO credentials (required if STORAGE_BACKEND=minio)',
  },
  {
    key: 'MOCK_MODE',
    required: false,
    format: 'boolean',
    defaultValue: 'false',
    description: 'Enable mock mode for development (conflicts with production settings)',
  },
];

function validateUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateBoolean(value: string): boolean {
  return value === 'true' || value === 'false';
}

function validateNumber(value: string): boolean {
  return !isNaN(Number(value)) && value.trim() !== '';
}

function validateFormat(value: string, format: EnvVarSchema['format']): boolean {
  if (!format) return true;
  switch (format) {
    case 'url':
      return validateUrl(value);
    case 'boolean':
      return validateBoolean(value);
    case 'number':
      return validateNumber(value);
    case 'string':
      return true;
    default:
      return true;
  }
}

function getEnvValue(key: string): string | undefined {
  return process.env[key];
}

function validateStorageBackendCoherence(errors: ValidationError[]): void {
  const backend = getEnvValue('STORAGE_BACKEND') || 'mock';
  const mockMode = getEnvValue('MOCK_MODE') === 'true';

  // Mock mode cannot coexist with non-mock storage backend
  if (mockMode && backend !== 'mock') {
    errors.push({
      key: 'MOCK_MODE',
      problem: `MOCK_MODE=true conflicts with STORAGE_BACKEND=${backend}`,
      suggestion: 'Set STORAGE_BACKEND=mock when MOCK_MODE=true, or disable MOCK_MODE',
    });
  }

  // S3 backend requires full S3 credentials
  if (backend === 's3') {
    const s3Vars = ['S3_BUCKET', 'S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    const missing = s3Vars.filter((v) => !getEnvValue(v));
    if (missing.length > 0) {
      errors.push({
        key: 'STORAGE_BACKEND',
        problem: `STORAGE_BACKEND=s3 requires complete S3 configuration, missing: ${missing.join(', ')}`,
        suggestion: `Set all required S3 variables: ${s3Vars.join(', ')} or switch to STORAGE_BACKEND=mock`,
      });
    }
  }

  // MinIO backend requires full MinIO credentials
  if (backend === 'minio') {
    const minioVars = ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'];
    const missing = minioVars.filter((v) => !getEnvValue(v));
    if (missing.length > 0) {
      errors.push({
        key: 'STORAGE_BACKEND',
        problem: `STORAGE_BACKEND=minio requires complete MinIO configuration, missing: ${missing.join(', ')}`,
        suggestion: `Set all required MinIO variables: ${minioVars.join(', ')} or switch to STORAGE_BACKEND=mock`,
      });
    }
  }
}

export function validateConfig(): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Validate each registered environment variable
  for (const schema of ENV_SCHEMA) {
    const value = getEnvValue(schema.key);

    // Check required variables
    if (schema.required && !value) {
      errors.push({
        key: schema.key,
        problem: `${schema.key} is required but not set`,
        suggestion: schema.defaultValue
          ? `Set ${schema.key} or use default: ${schema.defaultValue}`
          : `Set ${schema.key} in your environment. ${schema.description}`,
      });
      continue;
    }

    // Validate format if value is present
    if (value && schema.format && !validateFormat(value, schema.format)) {
      errors.push({
        key: schema.key,
        problem: `${schema.key} has invalid format (expected ${schema.format})`,
        suggestion:
          schema.format === 'url'
            ? `Provide a valid URL (e.g., https://example.com)`
            : schema.format === 'boolean'
              ? `Set to "true" or "false"`
              : `Provide a valid ${schema.format}`,
      });
    }
  }

  // Cross-field validation rules
  validateStorageBackendCoherence(errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const lines = [
    '❌ Configuration validation failed:',
    '',
    ...errors.map(
      (err, idx) =>
        `${idx + 1}. ${err.key}:\n   Problem: ${err.problem}\n   Fix: ${err.suggestion}\n`
    ),
    'Please fix the above configuration issues and restart the application.',
  ];

  return lines.join('\n');
}

export function validateAndThrow(): void {
  const result = validateConfig();
  if (!result.valid) {
    throw new Error(formatValidationErrors(result.errors));
  }
}
