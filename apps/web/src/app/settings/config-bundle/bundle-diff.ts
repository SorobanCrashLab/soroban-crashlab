/**
 * Dry-run diff between the current configuration and an incoming bundle
 * (#1426), so an import can be previewed section by section before anything is
 * written. Pure, so the preview shown and the change applied cannot disagree.
 */

import {
  BUNDLE_SECTIONS,
  canonicalizeValue,
  type BundleSectionName,
  type ConfigBundle,
} from './bundle-schema';

export interface DiffItem {
  id: string;
  name: string;
}

export interface SectionDiff {
  section: BundleSectionName;
  added: DiffItem[];
  changed: DiffItem[];
  unchanged: DiffItem[];
  /** Present today but absent from the bundle — import replaces the section. */
  removed: DiffItem[];
}

export interface BundleDiff {
  sections: SectionDiff[];
  totalAdded: number;
  totalChanged: number;
  totalRemoved: number;
}

interface Identifiable {
  id: string;
  name?: string;
}

function fingerprint(item: unknown): string {
  return JSON.stringify(canonicalizeValue(item));
}

function toDiffItem(item: Identifiable): DiffItem {
  return { id: item.id, name: item.name ?? item.id };
}

export function diffSection(
  section: BundleSectionName,
  current: readonly Identifiable[],
  incoming: readonly Identifiable[],
): SectionDiff {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const incomingIds = new Set(incoming.map((item) => item.id));

  const added: DiffItem[] = [];
  const changed: DiffItem[] = [];
  const unchanged: DiffItem[] = [];

  for (const item of incoming) {
    const existing = currentById.get(item.id);
    if (!existing) added.push(toDiffItem(item));
    else if (fingerprint(existing) !== fingerprint(item)) changed.push(toDiffItem(item));
    else unchanged.push(toDiffItem(item));
  }

  const removed = current
    .filter((item) => !incomingIds.has(item.id))
    .map(toDiffItem);

  return { section, added, changed, unchanged, removed };
}

export function diffBundle(current: ConfigBundle, incoming: ConfigBundle): BundleDiff {
  const sections = BUNDLE_SECTIONS.map((section) =>
    diffSection(section, current.sections[section], incoming.sections[section]),
  );

  return {
    sections,
    totalAdded: sections.reduce((sum, section) => sum + section.added.length, 0),
    totalChanged: sections.reduce((sum, section) => sum + section.changed.length, 0),
    totalRemoved: sections.reduce((sum, section) => sum + section.removed.length, 0),
  };
}
