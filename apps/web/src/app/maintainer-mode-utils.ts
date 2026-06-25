export const MAINTAINER_STORAGE_KEY = 'crashlab:maintainer-mode';

export function parseMaintainerStored(raw: string | null): boolean {
  return raw === 'true';
}

export function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}
