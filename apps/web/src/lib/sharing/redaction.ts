// WIP scaffold for issue #2274. Only a flat deny-list is supported; nested/array field
// masking and artifact-content redaction are not implemented yet.

export interface RedactionProfile {
  id: string;
  name: string;
  deniedFields: string[];
}

export function applyRedaction<T extends Record<string, unknown>>(
  record: T,
  profile: RedactionProfile,
): Partial<T> {
  const result: Partial<T> = { ...record };
  for (const field of profile.deniedFields) {
    delete result[field as keyof T];
  }
  return result;
}
