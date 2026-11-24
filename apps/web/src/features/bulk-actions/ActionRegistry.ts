// WIP scaffold for issue #2272. Entity-specific action sets (runs/campaigns/crashes/
// artifacts) are not registered yet — this is just the registry shape.

export interface BulkActionDefinition {
  id: string;
  label: string;
  entityType: string;
  destructive: boolean;
  requiresReason: boolean;
}

const registry = new Map<string, BulkActionDefinition>();

export function registerBulkAction(definition: BulkActionDefinition): void {
  registry.set(definition.id, definition);
}

export function getBulkActionsForEntity(entityType: string): BulkActionDefinition[] {
  return [...registry.values()].filter((action) => action.entityType === entityType);
}
