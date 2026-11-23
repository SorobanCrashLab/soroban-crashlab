import { describe, expect, it } from 'vitest';
import { buildMentionPayload, mentionHandles, tokenizeMentions } from './mentions';

describe('mention tokenizer', () => {
  it('extracts plain and structured mentions', () => {
    const text = 'Ping @alice and @[Bob Smith](user-42) about this.';
    expect(tokenizeMentions(text)).toMatchObject([
      { handle: 'alice', start: 5 },
      { handle: 'Bob Smith', id: 'user-42' },
    ]);
    expect(mentionHandles(text)).toEqual(['alice', 'Bob Smith']);
  });

  it('ignores e-mail addresses and deduplicates handles', () => {
    expect(mentionHandles('mail jane@example.com @alice @alice')).toEqual(['alice']);
  });

  it('builds the future API payload with stable comment ids', () => {
    expect(buildMentionPayload('c1', '@alice')).toEqual({
      commentId: 'c1',
      mentions: [{ handle: 'alice', id: undefined, start: 0, end: 6 }],
    });
  });
});
