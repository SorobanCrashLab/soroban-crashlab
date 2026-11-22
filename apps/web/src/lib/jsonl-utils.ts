// apps/web/src/lib/jsonl-utils.ts

/** Convert an array of objects to JSON Lines string */
export function toJSONLines<T>(items: T[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}
