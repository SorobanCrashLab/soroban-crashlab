const DANGEROUS_URL_PATTERN = /^[\s]*(javascript|data|vbscript):/i;

const MARKDOWN_DANGEROUS_LINK = /\[([^\]]*)\]\((javascript|data|vbscript):[^)]+\)/gi;

export function sanitizeUrl(url: string): string {
  if (DANGEROUS_URL_PATTERN.test(url)) {
    return "#";
  }
  return url;
}

export function sanitizeMarkdown(md: string): string {
  return md.replace(MARKDOWN_DANGEROUS_LINK, "$1");
}

export function sanitizeSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitized = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    sanitized.append(key, sanitizeUrl(value));
  }
  return sanitized;
}
