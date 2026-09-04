import { logger } from '@/lib/logger';

export interface Migration {
  id: string;
  name: string;
  up: () => Promise<void>;
  down?: () => Promise<void>;
}

class MigrationManager {
  private migrations: Map<string, Migration> = new Map();
  private appliedMigrations: Set<string> = new Set();

  public register(migration: Migration): void {
    this.migrations.set(migration.id, migration);
  }

  public async runMigrations(): Promise<void> {
    logger.info('Starting database migrations');

    for (const [id, migration] of this.migrations) {
      if (this.appliedMigrations.has(id)) {
        continue;
      }

      try {
        logger.info(`Running migration: ${migration.name}`, { migration_id: id });
        await migration.up();
        this.appliedMigrations.add(id);
        logger.info(`Migration completed: ${migration.name}`, { migration_id: id });
      } catch (error) {
        logger.error(`Migration failed: ${migration.name}`, { migration_id: id, error });
        throw error;
      }
    }

    logger.info('All migrations completed successfully');
  }

  public async rollbackLast(): Promise<void> {
    const appliedArray = Array.from(this.appliedMigrations);
    if (appliedArray.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    const lastId = appliedArray[appliedArray.length - 1];
    const migration = this.migrations.get(lastId);

    if (!migration || !migration.down) {
      logger.warn('Last migration does not support rollback', { migration_id: lastId });
      return;
    }

    try {
      logger.info(`Rolling back migration: ${migration.name}`, { migration_id: lastId });
      await migration.down();
      this.appliedMigrations.delete(lastId);
      logger.info(`Rollback completed: ${migration.name}`, { migration_id: lastId });
    } catch (error) {
      logger.error(`Rollback failed: ${migration.name}`, { migration_id: lastId, error });
      throw error;
    }
  }

  public getAppliedMigrations(): string[] {
    return Array.from(this.appliedMigrations);
  }
}

export const migrationManager = new MigrationManager();

export const initialSchema: Migration = {
  id: '001-initial',
  name: 'Create initial schema',
  up: async () => {
    logger.info('Creating initial database schema');
  },
  down: async () => {
    logger.info('Dropping initial database schema');
  },
};
