const DANGEROUS_URL_PATTERN = /^[\s]*(javascript|data|vbscript):/i;

const MARKDOWN_DANGEROUS_LINK = /\[([^\]]*)\]\((javascript|data|vbscript):[^)]+\)/gi;

/**
 * HTML entities that must be escaped before inserting untrusted content
 * into the DOM via innerHTML or similar sinks.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

/**
 * Sanitize a URL by blocking dangerous protocol schemes (javascript:, data:,
 * vbscript:) that could execute arbitrary code when used in href/src attributes.
 * Returns "#" for dangerous URLs.
 */
export function sanitizeUrl(url: string): string {
  if (DANGEROUS_URL_PATTERN.test(url)) {
    return "#";
  }
  return url;
}

/**
 * Remove dangerous links from Markdown text while preserving the link label.
 * Targets javascript:, data:, and vbscript: protocol schemes.
 */
export function sanitizeMarkdown(md: string): string {
  return md.replace(MARKDOWN_DANGEROUS_LINK, "$1");
}

/**
 * Sanitize URL values in search parameters by blocking dangerous protocols.
 * Returns a new URLSearchParams instance with safe values.
 */
export function sanitizeSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitized = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    sanitized.append(key, sanitizeUrl(value));
  }
  return sanitized;
}

/**
 * Escape HTML special characters in a string to prevent XSS when inserting
 * untrusted content into the DOM via innerHTML or similar sinks.
 * Converts &, <, >, ", ', /, and ` to their HTML entity equivalents.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'\/`=]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize HTML content by removing potentially dangerous elements and attributes.
 * This function strips script tags, event handlers (on*), and dangerous protocols
 * from HTML strings before rendering. Use this when rendering user-generated content.
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;

  // Remove script tags and their contents
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handler attributes (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove javascript: and data: URLs from href/src attributes
  sanitized = sanitized.replace(
    /\s+(href|src|action)\s*=\s*(?:"[\s]*(?:javascript|data|vbscript):[^"]*"|'[\s]*(?:javascript|data|vbscript):[^']*')/gi,
    ''
  );

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove object/embed tags
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '');

  // Remove form tags (potential phishing vector)
  sanitized = sanitized.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');

  return sanitized;
}

/**
 * Sanitize user-generated content for safe rendering in the DOM.
 * Combines HTML entity escaping with dangerous pattern removal.
 * Use this for content that should be displayed as plain text.
 */
export function sanitizeUserContent(content: string): string {
  return escapeHtml(content);
}
