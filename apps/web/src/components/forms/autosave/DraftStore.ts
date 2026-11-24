// WIP scaffold for issue #2278. Local-storage-only; no server-side draft sync or
// conflict detection yet.

const PREFIX = "crashlab:form-draft:";

export function saveDraft(formId: string, values: unknown): void {
  try {
    window.localStorage.setItem(`${PREFIX}${formId}`, JSON.stringify(values));
  } catch {
    // best-effort; storage may be unavailable
  }
}

export function loadDraft<T>(formId: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${formId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function discardDraft(formId: string): void {
  try {
    window.localStorage.removeItem(`${PREFIX}${formId}`);
  } catch {
    // best-effort
  }
}
