/** Structured @mention tokenizer for inline comments. */

export interface Mention {
  handle: string;
  id?: string;
  start: number;
  end: number;
}

/** Matches `@handle` and `@[Display Name](user-id)` without matching e-mail hosts. */
const MENTION_PATTERN = /@\[([^\]]{1,80})\]\(([^\s)]{1,120})\)|@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,39})/g;

export function tokenizeMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > 0 && /[\w.+-]/.test(text[start - 1])) continue;
    mentions.push({
      handle: match[1] ?? match[3] ?? '',
      id: match[2],
      start,
      end: start + match[0].length,
    });
  }
  return mentions;
}

export function mentionHandles(text: string): string[] {
  return [...new Set(tokenizeMentions(text).map((mention) => mention.handle))];
}

/** Integration hook: future comment API can persist the structured mentions. */
export interface CommentMentionPayload {
  commentId: string;
  mentions: Mention[];
}

export function buildMentionPayload(commentId: string, body: string): CommentMentionPayload {
  return { commentId, mentions: tokenizeMentions(body) };
}
