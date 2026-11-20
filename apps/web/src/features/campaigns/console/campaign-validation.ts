/**
 * Campaign creation/editor validation and template versioning (#2258).
 * Pure so the wizard can validate on every keystroke without a network call.
 */

export interface CampaignDraft {
  name: string;
  description: string;
  seedCount: number;
  durationMinutes: number;
  parallelism: number;
  fixture: string;
  tags: string[];
}

export type ValidationErrors = Partial<Record<keyof CampaignDraft, string>>;

export const DEFAULT_DRAFT: CampaignDraft = {
  name: '',
  description: '',
  seedCount: 100,
  durationMinutes: 30,
  parallelism: 4,
  fixture: '',
  tags: [],
};

export function validateDraft(draft: CampaignDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = draft.name.trim();
  if (name.length < 3) errors.name = 'Name must be at least 3 characters.';
  if (name.length > 120) errors.name = 'Name must be 120 characters or fewer.';
  if (draft.description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';
  if (!Number.isInteger(draft.seedCount) || draft.seedCount < 1 || draft.seedCount > 100_000) {
    errors.seedCount = 'Seed count must be between 1 and 100,000.';
  }
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 14_400) {
    errors.durationMinutes = 'Duration must be between 1 and 14,400 minutes.';
  }
  if (!Number.isInteger(draft.parallelism) || draft.parallelism < 1 || draft.parallelism > 64) {
    errors.parallelism = 'Parallelism must be between 1 and 64.';
  }
  if (!draft.fixture.trim()) errors.fixture = 'Choose a contract fixture.';
  if (draft.tags.some((tag) => !/^[\w-]{1,32}$/.test(tag))) {
    errors.tags = 'Tags must be 1-32 word or dash characters.';
  }
  return errors;
}

export function isDraftValid(draft: CampaignDraft): boolean {
  return Object.keys(validateDraft(draft)).length === 0;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  version: number;
  draft: CampaignDraft;
}

export const BUILTIN_TEMPLATES: readonly CampaignTemplate[] = [
  {
    id: 'quick-smoke',
    name: 'Quick smoke',
    version: 1,
    draft: { ...DEFAULT_DRAFT, name: 'Quick smoke', seedCount: 25, durationMinutes: 5, fixture: 'token' },
  },
  {
    id: 'overnight-deep',
    name: 'Overnight deep fuzz',
    version: 2,
    draft: { ...DEFAULT_DRAFT, name: 'Overnight deep fuzz', seedCount: 5000, durationMinutes: 480, parallelism: 8, fixture: 'token' },
  },
  {
    id: 'fee-regression',
    name: 'Fee regression',
    version: 1,
    draft: { ...DEFAULT_DRAFT, name: 'Fee regression', seedCount: 500, durationMinutes: 60, fixture: 'account', tags: ['fees'] },
  },
];

export function applyTemplate(template: CampaignTemplate, nameOverride?: string): CampaignDraft {
  return { ...template.draft, name: nameOverride?.trim() || template.draft.name, tags: [...template.draft.tags] };
}

/** Export a shareable template JSON payload (no secrets, deterministic order). */
export function exportTemplate(template: CampaignTemplate): string {
  return JSON.stringify({
    id: template.id,
    name: template.name,
    version: template.version,
    draft: { ...template.draft, tags: [...template.draft.tags] },
  });
}

export function parseTemplate(json: string): CampaignTemplate | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<CampaignTemplate>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !candidate.draft) return null;
    const version = typeof candidate.version === 'number' && candidate.version > 0 ? candidate.version : 1;
    return { id: candidate.id, name: candidate.name, version, draft: { ...DEFAULT_DRAFT, ...candidate.draft } };
  } catch {
    return null;
  }
}

export function nextTemplateVersion(existing: readonly CampaignTemplate[], id: string): number {
  const versions = existing.filter((template) => template.id === id).map((template) => template.version);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

export function duplicateTemplate(template: CampaignTemplate, existing: readonly CampaignTemplate[]): CampaignTemplate {
  const id = `${template.id}-copy`;
  return { ...template, id, version: nextTemplateVersion(existing, id), draft: { ...template.draft, tags: [...template.draft.tags] } };
}
