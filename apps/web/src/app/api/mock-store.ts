/**
 * Persistent mock data stores backed by globalThis.
 *
 * Plain module-level `new Map()` instances are destroyed on every hot-module
 * reload during development and on serverless cold starts (Vercel).  Storing
 * the maps on `globalThis` keeps them alive across HMR cycles and warm
 * serverless invocations within the same process.
 *
 * On a genuine cold start the maps are re-created empty and seeded lazily by
 * the existing `getTags` / `getAnnotations` / `getIssues` helpers in each
 * route file, so the user always sees a consistent initial dataset.
 */

 
const g = globalThis as Record<string, any>;

function getOrCreateMap<V>(key: string): Map<string, V> {
  if (!(g[key] instanceof Map)) {
    g[key] = new Map<string, V>();
  }
  return g[key] as Map<string, V>;
}

export function getTagStore(): Map<string, string[]> {
  return getOrCreateMap<string[]>('__crashlab_tagStore');
}

export function getAnnotationStore(): Map<string, string[]> {
  return getOrCreateMap<string[]>('__crashlab_annotationStore');
}

export function getIssueStore<V>(): Map<string, V[]> {
  return getOrCreateMap<V[]>('__crashlab_issueStore');
}
