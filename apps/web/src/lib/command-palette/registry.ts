/**
 * Command palette registry: static entries + async providers, searched together.
 *
 * Open/closed by design — features register entries or providers from their
 * own module without editing this file (see `command-palette-static-entries.ts`
 * and `command-palette-runs-provider.ts` for feature-owned contributions).
 */
import { fuzzyMatch } from './matcher';

export type CommandCategory = 'navigation' | 'action' | 'run';

export interface CommandEntry {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  category: CommandCategory;
  keywords?: string[];
  shortcut?: string;
  /** Context predicate for commands that only apply to a particular route. */
  when?: (context: CommandContext) => boolean;
  /** Optional child actions shown after opening this command. */
  children?: CommandEntry[];
  /** Route path for navigation commands (e.g. `/runs`). Declarative so the
   *  keyboard-cheatsheet overlay can match key chords and execute by route. */
  route?: string;
  run: (arguments_?: Record<string, string | string[]>) => void | Promise<void>;
  arguments?: CommandArgument[];
}

export interface CommandArgument {
  id: string;
  label: string;
  type: 'text' | 'select' | 'multi-select';
  options?: string[];
  required?: boolean;
}

export interface CommandContext {
  pathname: string;
}

/**
 * Dynamic providers must be cancellation-safe: `suggest` receives the
 * `AbortSignal` for the in-flight query and should stop work (or its results
 * will simply be discarded) once it fires.
 */
export interface CommandProvider {
  id: string;
  when?: (context: CommandContext) => boolean;
  suggest(query: string, signal: AbortSignal): Promise<CommandEntry[]>;
}

export interface ScoredEntry {
  entry: CommandEntry;
  score: number;
  indices: number[];
}

export interface SearchOptions {
  signal: AbortSignal;
  /** Most-recent-first list of previously executed command ids. */
  recentIds?: string[];
  context?: CommandContext;
}

const RECENT_BOOST_STEP = 25;

function entryScore(entry: CommandEntry, query: string): { score: number; indices: number[] } | null {
  const titleMatch = fuzzyMatch(query, entry.title);
  const descriptionMatch = fuzzyMatch(query, entry.description ?? entry.subtitle ?? '');
  const keywordMatches = (entry.keywords ?? []).map((keyword) => fuzzyMatch(query, keyword));
  const idMatch = fuzzyMatch(query, entry.id);

  const weightedMatches = [
    { match: titleMatch, weight: 4 },
    { match: descriptionMatch, weight: 2 },
    ...keywordMatches.map((match) => ({ match, weight: 1 })),
    { match: idMatch, weight: 1 },
  ].filter(({ match }) => match.matched);

  if (weightedMatches.length === 0) return null;

  return {
    score: Math.max(...weightedMatches.map(({ match, weight }) => match.score * weight)),
    indices: titleMatch.matched ? titleMatch.indices : [],
  };
}

export function createCommandRegistry() {
  const staticEntries = new Map<string, CommandEntry>();
  const providers = new Map<string, CommandProvider>();

  function registerEntries(entries: CommandEntry[]): () => void {
    for (const entry of entries) {
      staticEntries.set(entry.id, entry);
    }
    return () => {
      for (const entry of entries) {
        if (staticEntries.get(entry.id) === entry) staticEntries.delete(entry.id);
      }
    };
  }

  function registerProvider(provider: CommandProvider): () => void {
    providers.set(provider.id, provider);
    return () => {
      if (providers.get(provider.id) === provider) providers.delete(provider.id);
    };
  }

  function recentBoost(id: string, recentIds: string[] | undefined): number {
    if (!recentIds) return 0;
    const index = recentIds.indexOf(id);
    return index >= 0 ? (recentIds.length - index) * RECENT_BOOST_STEP : 0;
  }

  async function search(query: string, options: SearchOptions): Promise<ScoredEntry[]> {
    const trimmed = query.trim();
    const seen = new Set<string>();
    const results: ScoredEntry[] = [];

    for (const entry of staticEntries.values()) {
      if (options.context && entry.when && !entry.when(options.context)) continue;
      const match = trimmed === '' ? { score: 0, indices: [] } : entryScore(entry, trimmed);
      if (!match) continue;
      seen.add(entry.id);
      results.push({ entry, score: match.score + recentBoost(entry.id, options.recentIds), indices: match.indices });
    }

    const applicableProviders = Array.from(providers.values()).filter(
      (provider) => !options.context || !provider.when || provider.when(options.context),
    );
    if (trimmed !== '' && applicableProviders.length > 0) {
      const providerLists = await Promise.all(
        applicableProviders.map((provider) =>
          provider.suggest(trimmed, options.signal).catch(() => [] as CommandEntry[]),
        ),
      );

      // Cancellation-safety: if the caller's signal fired while providers were
      // resolving, the results are stale — discard them rather than risk
      // showing suggestions for a query the user has since changed.
      if (options.signal.aborted) {
        return [];
      }

      for (const list of providerLists) {
        for (const entry of list) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          results.push({ entry, score: recentBoost(entry.id, options.recentIds), indices: [] });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function clear(): void {
    staticEntries.clear();
    providers.clear();
  }

  /**
   * Enumerates the currently registered static entries. Read-only view used by
   * surfaces that render the registry as the single source of truth (e.g. the
   * keyboard-cheatsheet overlay). Provider results are query-driven and are
   * not part of this snapshot.
   */
  function listEntries(): CommandEntry[] {
    return Array.from(staticEntries.values());
  }

  return { registerEntries, registerProvider, search, clear, listEntries };
}

export type CommandRegistry = ReturnType<typeof createCommandRegistry>;

/** Singleton registry shared by the palette UI and feature-owned contributions. */
export const commandRegistry = createCommandRegistry();
