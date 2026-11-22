/**
 * Mention tokenizer for annotation threads (#1429).
 *
 * `@name` renders as an inert link when `name` is on the roster; anything else
 * stays literal text. Keeping this a pure function lets the awkward inputs —
 * `@@`, a trailing `@`, unicode handles — be pinned by tests instead of being
 * discovered in the renderer.
 */

export type MentionToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; handle: string };

/**
 * Characters that may appear in a handle. Unicode letters and numbers are in
 * so a roster name like `zoë` mentions cleanly.
 */
const HANDLE_PATTERN = /[\p{L}\p{N}_.-]+/uy;

function readHandle(text: string, index: number): string | null {
  HANDLE_PATTERN.lastIndex = index;
  const match = HANDLE_PATTERN.exec(text);
  return match ? match[0] : null;
}

export function tokenizeMentions(
  text: string,
  roster: readonly string[],
): MentionToken[] {
  // Roster matching is case-insensitive, but the token carries the roster's
  // own casing so the rendered link reads consistently.
  const known = new Map(roster.map((name) => [name.toLowerCase(), name]));
  const tokens: MentionToken[] = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (buffer) {
      tokens.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (index < text.length) {
    if (text[index] !== '@') {
      buffer += text[index];
      index += 1;
      continue;
    }

    // `@@name` is how a writer escapes a mention: both sigils stay literal and
    // the name is never linked.
    if (text[index + 1] === '@') {
      buffer += '@@';
      index += 2;
      continue;
    }

    const handle = readHandle(text, index + 1);
    const canonical = handle ? known.get(handle.toLowerCase()) : undefined;

    if (!handle || !canonical) {
      // Unknown handle, or a bare `@` at the end of the line: literal text.
      buffer += `@${handle ?? ''}`;
      index += 1 + (handle?.length ?? 0);
      continue;
    }

    flush();
    tokens.push({ type: 'mention', value: `@${handle}`, handle: canonical });
    index += 1 + handle.length;
  }

  flush();
  return tokens;
}
