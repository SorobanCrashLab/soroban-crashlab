// WIP scaffold for issue #2277. Sorts keys and omits defaulted values so equivalent
// states produce identical URLs.

export function canonicalize<T extends Record<string, unknown>>(value: T, defaults: T): Partial<T> {
  const sortedKeys = Object.keys(value).sort() as Array<keyof T>;
  const result: Partial<T> = {};

  for (const key of sortedKeys) {
    if (JSON.stringify(value[key]) !== JSON.stringify(defaults[key])) {
      result[key] = value[key];
    }
  }

  return result;
}
