/**
 * Utility functions for run tag management.
 */

export const MAX_TAG_LENGTH = 64;
export const MAX_TAGS_PER_RUN = 20;

export interface TagResult {
  success: boolean;
  tags: string[];
  error?: string;
}

/**
 * Normalizes a tag to lowercase kebab-case.
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validates a tag string before adding it.
 */
export function validateTag(tag: string): { valid: boolean; error?: string } {
  const normalized = normalizeTag(tag);
  if (!normalized) {
    return { valid: false, error: 'Tag cannot be empty' };
  }
  if (normalized.length > MAX_TAG_LENGTH) {
    return { valid: false, error: `Tag exceeds ${MAX_TAG_LENGTH} character limit` };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    return { valid: false, error: 'Tag must use lowercase letters, numbers, and hyphens' };
  }
  return { valid: true };
}

/**
 * Adds a tag to an existing list after validation.
 * Storage form is the canonical lowercase kebab-case string; uniqueness is
 * checked against that normalized form so tags that only differ by case or
 * surrounding/embedded whitespace are treated as duplicates. When a duplicate
 * already exists, the inline error names the existing tag.
 */
export function addTag(existing: string[], tag: string): TagResult {
  const validation = validateTag(tag);
  if (!validation.valid) {
    return { success: false, tags: existing, error: validation.error };
  }
  const normalized = normalizeTag(tag);
  const existingNormalized = existing.map(normalizeTag);
  const index = existingNormalized.indexOf(normalized);
  if (index !== -1) {
    const existingTag = existing[index];
    return {
      success: false,
      tags: existing,
      error: existingTag === normalized
        ? `Tag "${normalized}" already exists`
        : `Tag already exists as "${existingTag}"`,
    };
  }
  if (existing.length >= MAX_TAGS_PER_RUN) {
    return {
      success: false,
      tags: existing,
      error: `Cannot exceed ${MAX_TAGS_PER_RUN} tags per run`,
    };
  }
  return { success: true, tags: [...existing, normalized].sort() };
}

/**
 * Removes a tag from the list by normalized form.
 */
export function removeTag(existing: string[], tag: string): string[] {
  const normalized = normalizeTag(tag);
  return existing.filter((item) => normalizeTag(item) !== normalized);
}

/**
 * Returns true when a run matches the active tag filter.
 * Comparison is performed on the normalized form so case/whitespace variants
 * never fragment the dataset (exact-string matching would show partial results).
 */
export function runMatchesTagFilter(
  runTags: string[],
  suggestedLabels: string[],
  activeTag: string | null,
): boolean {
  if (!activeTag || activeTag === 'all') {
    return true;
  }
  const active = normalizeTag(activeTag);
  const allLabels = [...runTags, ...suggestedLabels].map(normalizeTag);
  return allLabels.includes(active);
}

/**
 * Normalized identity used for duplicate detection and merge semantics:
 * trim plus lowercase only. Unlike `normalizeTag`, it does not rewrite spaces
 * to hyphens, so display casing of the first-created variant is preserved.
 */
export function normalizedIdentity(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Merge existing tags that only differ by normalized identity into a single
 * canonical tag per group. The first-seen variant's casing is retained for
 * display; all references in `assignments` are re-pointed to the canonical tag.
 *
 * @param tags          Flat list of tag names in use.
 * @param assignments   Map of runId -> tags currently assigned to that run.
 * @returns Result containing the deduped tag list, the re-pointed assignments,
 *          and per-tag before/after assignment counts.
 */
export function mergeDuplicateTags(
  tags: string[],
  assignments: Record<string, string[]>,
): {
  tags: string[];
  assignments: Record<string, string[]>;
  merged: Array<{
    canonical: string;
    mergedInto: string[];
    beforeCount: number;
    afterCount: number;
  }>;
} {
  const canonicalByIdentity = new Map<string, string>();
  for (const tag of tags) {
    const identity = normalizedIdentity(tag);
    if (!canonicalByIdentity.has(identity)) {
      canonicalByIdentity.set(identity, tag);
    }
  }

  const canonicalSet = new Set(canonicalByIdentity.values());

  const reMappedAssignments: Record<string, string[]> = {};
  for (const [runId, list] of Object.entries(assignments)) {
    reMappedAssignments[runId] = list.map((tag) => canonicalByIdentity.get(normalizedIdentity(tag)) ?? tag);
  }

  const merged: Array<{
    canonical: string;
    mergedInto: string[];
    beforeCount: number;
    afterCount: number;
  }> = [];

  const { identityVariants } = (() => {
    const identityVariants = new Map<string, string[]>();
    for (const tag of tags) {
      const identity = normalizedIdentity(tag);
      const variants = identityVariants.get(identity) ?? [];
      variants.push(tag);
      identityVariants.set(identity, variants);
    }
    return { identityVariants };
  })();

  for (const [identity, canonical] of canonicalByIdentity) {
    const variants = identityVariants.get(identity) ?? [];
    const losing = variants.filter((variant) => variant !== canonical);
    if (losing.length === 0) continue;

    const beforeCount = Object.values(assignments).filter((list) =>
      list.some((tag) => normalizedIdentity(tag) === identity),
    ).length;
    const afterCount = Object.values(reMappedAssignments).filter((list) =>
      list.includes(canonical),
    ).length;

    merged.push({
      canonical,
      mergedInto: losing.map(normalizedIdentity),
      beforeCount,
      afterCount,
    });
  }

  return {
    tags: Array.from(canonicalSet),
    assignments: reMappedAssignments,
    merged,
  };
}
