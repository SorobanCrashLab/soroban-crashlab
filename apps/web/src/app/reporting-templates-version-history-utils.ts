import { safeStorage } from "../lib/local-storage";

export interface TemplateVersion {
  id: string;
  templateId: string;
  name: string;
  kind: string;
  body: string;
  savedAt: string;
}

const VERSIONS_STORAGE_KEY = 'crashlab:reporting-templates:versions:v1';
const MAX_VERSIONS_PER_TEMPLATE = 20;

export function readVersionHistory(): TemplateVersion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorage.getItem(VERSIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TemplateVersion[]) : [];
  } catch {
    return [];
  }
}

export function saveVersionHistory(versions: TemplateVersion[]): boolean {
  try {
    safeStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(versions));
    return true;
  } catch {
    return false;
  }
}

export function addVersion(
  templateId: string,
  name: string,
  kind: string,
  body: string,
): TemplateVersion[] {
  const versions = readVersionHistory();
  const version: TemplateVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    templateId,
    name,
    kind,
    body,
    savedAt: new Date().toISOString(),
  };
  const updated = [version, ...versions];
  const templateVersions = updated.filter((v) => v.templateId === templateId);
  if (templateVersions.length > MAX_VERSIONS_PER_TEMPLATE) {
    const toRemove = templateVersions.slice(MAX_VERSIONS_PER_TEMPLATE);
    const removeIds = new Set(toRemove.map((v) => v.id));
    return updated.filter((v) => !removeIds.has(v.id));
  }
  return updated;
}

export function getVersionsForTemplate(
  templateId: string,
): TemplateVersion[] {
  return readVersionHistory().filter((v) => v.templateId === templateId);
}

export function restoreVersion(
  versions: TemplateVersion[],
  versionId: string,
): TemplateVersion | undefined {
  return versions.find((v) => v.id === versionId);
}

export function clearVersionHistory(): boolean {
  try {
    safeStorage.removeItem(VERSIONS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
