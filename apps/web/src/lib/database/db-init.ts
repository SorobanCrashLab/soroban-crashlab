import { logger } from '@/lib/logger';

export type DatabaseType = 'sqlite' | 'postgres' | 'vercel-postgres';

export interface DatabaseConfig {
  type: DatabaseType;
  url?: string;
  name?: string;
  path?: string;
  connectionPool?: {
    min: number;
    max: number;
  };
}

class Database {
  private config: DatabaseConfig;
  private initialized: boolean = false;

  constructor(config?: DatabaseConfig) {
    this.config = config || this.detectDatabaseConfig();
  }

  private detectDatabaseConfig(): DatabaseConfig {
    const dbType = (process.env.DATABASE_TYPE || 'sqlite') as DatabaseType;

    if (dbType === 'vercel-postgres' && process.env.POSTGRES_URL_NON_POOLING) {
      return {
        type: 'vercel-postgres',
        url: process.env.POSTGRES_URL_NON_POOLING,
        connectionPool: {
          min: 1,
          max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        },
      };
    }

    if (dbType === 'postgres' && process.env.DATABASE_URL) {
      return {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        connectionPool: {
          min: 1,
          max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        },
      };
    }

    return {
      type: 'sqlite',
      path: process.env.SQLITE_PATH || '.data/crashlab.db',
      connectionPool: {
        min: 1,
        max: 5,
      },
    };
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing database', {
      type: this.config.type,
      environment: process.env.NODE_ENV,
    });

    try {
      switch (this.config.type) {
        case 'vercel-postgres':
          await this.initializeVercelPostgres();
          break;
        case 'postgres':
          await this.initializePostgres();
          break;
        case 'sqlite':
          await this.initializeSQLite();
          break;
      }

      this.initialized = true;
      logger.info('Database initialized successfully', {
        type: this.config.type,
      });
    } catch (error) {
      logger.error('Database initialization failed', {
        error,
        type: this.config.type,
      });
      throw error;
    }
  }

  private async initializeVercelPostgres(): Promise<void> {
    if (!this.config.url) {
      throw new Error('POSTGRES_URL_NON_POOLING must be set for Vercel Postgres');
    }

    try {
      // Connection string validation
      new URL(this.config.url);
      logger.info('Vercel Postgres connection validated', {
        pool_max: this.config.connectionPool?.max,
      });
    } catch {
      throw new Error('Invalid Vercel Postgres connection string');
    }
  }

  private async initializePostgres(): Promise<void> {
    if (!this.config.url) {
      throw new Error('DATABASE_URL must be set for PostgreSQL');
    }

    try {
      new URL(this.config.url);
      logger.info('PostgreSQL connection validated', {
        pool_min: this.config.connectionPool?.min,
        pool_max: this.config.connectionPool?.max,
      });
    } catch {
      throw new Error('Invalid PostgreSQL connection string');
    }
  }

  private async initializeSQLite(): Promise<void> {
    const path = this.config.path || '.data/crashlab.db';

    try {
      const fs = await import('fs').then((m) => m.promises);
      const dir = path.substring(0, path.lastIndexOf('/'));

      if (dir && !dir.startsWith('memory')) {
        await fs.mkdir(dir, { recursive: true });
        logger.info('SQLite data directory created', { path: dir });
      }

      logger.info('SQLite database initialized', {
        path,
        pool_max: this.config.connectionPool?.max,
      });
    } catch (error) {
      logger.error('SQLite initialization error', { error, path });
      throw error;
    }
  }

  public getConfig(): DatabaseConfig {
    return this.config;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

let dbInstance: Database;

export function getDatabase(config?: DatabaseConfig): Database {
  if (!dbInstance) {
    dbInstance = new Database(config);
  }
  return dbInstance;
}

export async function initializeDatabase(config?: DatabaseConfig): Promise<Database> {
  const db = getDatabase(config);
  await db.initialize();
  return db;
}
