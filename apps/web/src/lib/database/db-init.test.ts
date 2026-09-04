import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDatabase, initializeDatabase } from './db-init';

describe('Database Initialization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('detects SQLite as default database type', async () => {
    const db = getDatabase();
    const config = db.getConfig();

    expect(config.type).toBe('sqlite');
    expect(config.path).toBeDefined();
  });

  it('initializes without errors', async () => {
    const db = await initializeDatabase();
    expect(db.isInitialized()).toBe(true);
  });

  it('uses configured database type from environment', () => {
    process.env.DATABASE_TYPE = 'postgres';
    process.env.DATABASE_URL = 'postgresql://localhost/test';

    const db = getDatabase();
    const config = db.getConfig();

    expect(config.type).toBe('postgres');
    expect(config.url).toBe('postgresql://localhost/test');

    delete process.env.DATABASE_TYPE;
    delete process.env.DATABASE_URL;
  });

  it('uses Vercel Postgres when configured', () => {
    process.env.DATABASE_TYPE = 'vercel-postgres';
    process.env.POSTGRES_URL_NON_POOLING = 'postgresql://vercel-user@vercel-host/vercel-db';

    const db = getDatabase();
    const config = db.getConfig();

    expect(config.type).toBe('vercel-postgres');
    expect(config.url).toBe('postgresql://vercel-user@vercel-host/vercel-db');

    delete process.env.DATABASE_TYPE;
    delete process.env.POSTGRES_URL_NON_POOLING;
  });

  it('applies connection pool configuration', () => {
    process.env.DATABASE_TYPE = 'sqlite';
    process.env.DB_POOL_MAX = '20';

    const db = getDatabase();
    const config = db.getConfig();

    expect(config.connectionPool?.max).toBe(20);

    delete process.env.DATABASE_TYPE;
    delete process.env.DB_POOL_MAX;
  });
});
