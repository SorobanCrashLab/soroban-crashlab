export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function slugifyWithFallback(input: string, fallback = "template"): string {
  return slugify(input) || fallback;
}
