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
 */
export function addTag(existing: string[], tag: string): TagResult {
  const validation = validateTag(tag);
  if (!validation.valid) {
    return { success: false, tags: existing, error: validation.error };
  }
  const normalized = normalizeTag(tag);
  if (existing.includes(normalized)) {
    return { success: true, tags: existing };
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
 * Removes a tag from the list.
 */
export function removeTag(existing: string[], tag: string): string[] {
  const normalized = normalizeTag(tag);
  return existing.filter((item) => item !== normalized);
}

/**
 * Returns true when a run matches the active tag filter.
 */
export function runMatchesTagFilter(
  runTags: string[],
  suggestedLabels: string[],
  activeTag: string | null,
): boolean {
  if (!activeTag || activeTag === 'all') {
    return true;
  }
  const allLabels = new Set([...runTags, ...suggestedLabels]);
  return allLabels.has(activeTag);
}
