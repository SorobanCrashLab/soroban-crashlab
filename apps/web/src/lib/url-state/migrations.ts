// WIP scaffold for issue #2277. Migration registry shape only; no migrations registered yet.

export type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const migrations = new Map<string, MigrationFn>();

function migrationKey(routeId: string, fromVersion: number): string {
  return `${routeId}:${fromVersion}`;
}

export function registerMigration(routeId: string, fromVersion: number, migrate: MigrationFn): void {
  migrations.set(migrationKey(routeId, fromVersion), migrate);
}

export function applyMigration(
  routeId: string,
  fromVersion: number,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const migrate = migrations.get(migrationKey(routeId, fromVersion));
  return migrate ? migrate(raw) : raw;
}
