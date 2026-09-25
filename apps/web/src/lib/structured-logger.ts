import { headers } from 'next/headers';

type LogLevel = 'info' | 'warn' | 'error';

interface StructuredLogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  correlationId?: string;
  requestId?: string;
  service?: string;
  environment?: string;
  module?: string;
  [key: string]: unknown;
}

interface CloudWatchConfig {
  enabled: boolean;
  logGroup?: string;
  logStream?: string;
  region?: string;
}

type LogWriter = (entry: StructuredLogEntry) => void | Promise<void>;

const REDACTED_KEYS = new Set(['token', 'password', 'secret', 'authorization', 'cookie', 'bearer']);

function redact(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(k.toLowerCase()) || k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redact(v);
    }
  }
  return result;
}

export class StructuredLogger {
  private writer: LogWriter;
  private cloudWatchConfig: CloudWatchConfig;
  private service: string;
  private environment: string;
  private defaultModule?: string;

  constructor(writer: LogWriter, cloudWatchConfig?: CloudWatchConfig, defaultModule?: string) {
    this.writer = writer;
    this.cloudWatchConfig = cloudWatchConfig || { enabled: false };
    this.service = process.env.SERVICE_NAME || 'soroban-crashlab';
    this.environment = process.env.NODE_ENV || 'development';
    this.defaultModule = defaultModule;
  }

  public withModule(module: string): StructuredLogger {
    return new StructuredLogger(this.writer, this.cloudWatchConfig, module);
  }

  private async log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): Promise<void> {
    let requestId: string | undefined = undefined;
    try {
      const h = await headers();
      requestId = h.get('x-request-id') || undefined;
    } catch (e) {
      // not in a request context
    }

    const entry: StructuredLogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      service: this.service,
      environment: this.environment,
      requestId,
      module: this.defaultModule,
      ...redact(fields) as Record<string, unknown>,
    };

    try {
      await this.writer(entry);
    } catch (error) {
      console.error('Failed to write log', error);
    }
  }

  public async info(message: string, fields?: Record<string, unknown>): Promise<void> {
    return this.log('info', message, fields);
  }

  public async warn(message: string, fields?: Record<string, unknown>): Promise<void> {
    return this.log('warn', message, fields);
  }

  public async error(message: string, fields?: Record<string, unknown>): Promise<void> {
    return this.log('error', message, fields);
  }

  public isCloudWatchEnabled(): boolean {
    return this.cloudWatchConfig.enabled && !!this.cloudWatchConfig.logGroup;
  }

  public getCloudWatchConfig(): CloudWatchConfig {
    return this.cloudWatchConfig;
  }
}

function defaultWriter(entry: StructuredLogEntry): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const structuredLogger = new StructuredLogger(
  defaultWriter,
  {
    enabled: process.env.CLOUDWATCH_ENABLED === 'true',
    logGroup: process.env.CLOUDWATCH_LOG_GROUP,
    logStream: process.env.CLOUDWATCH_LOG_STREAM,
    region: process.env.AWS_REGION || 'us-east-1',
  },
);
