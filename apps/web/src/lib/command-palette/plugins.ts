import { commandRegistry, type CommandEntry, type CommandProvider } from './registry';

/**
 * Register a feature command without coupling the feature to the palette UI.
 * The returned disposer should be called when the feature is unloaded.
 */
export function registerCommand(command: CommandEntry): () => void {
  return commandRegistry.registerEntries([command]);
}

/** Register an async suggestion provider for the lifetime of a feature. */
export function registerCommandProvider(provider: CommandProvider): () => void {
  return commandRegistry.registerProvider(provider);
}
