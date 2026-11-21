// WIP scaffold for issue #2272. Does not yet use the real permissions lib
// (apps/web/src/lib/permissions.ts) — placeholder signature only.

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkActionPermission(
  _actionId: string,
  _entityId: string,
): PermissionCheckResult {
  return { allowed: true };
}
