import { describe, it, expect } from 'vitest';
import { createTranslator } from './t';

const messages = {
  notifications: {
    preferences: {
      title: 'Notification Preferences',
      enabledTypesCount: '{count, plural, one {# notification type enabled} other {# notification types enabled}}',
      greeting: 'Hello {name}',
    },
    status: {
      byState: '{state, select, active {Active} paused {Paused} other {Unknown}}',
    },
  },
};

describe('createTranslator', () => {
  it('resolves a plain message by dotted key', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(t('notifications.preferences.title' as never)).toBe('Notification Preferences');
  });

  it('interpolates a simple param', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(t('notifications.preferences.greeting' as never, { name: 'Ada' })).toBe('Hello Ada');
  });

  it('handles the plural "one" case', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(t('notifications.preferences.enabledTypesCount' as never, { count: 1 })).toBe(
      '1 notification type enabled',
    );
  });

  it('handles the plural "other" case', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(t('notifications.preferences.enabledTypesCount' as never, { count: 4 })).toBe(
      '4 notification types enabled',
    );
    expect(t('notifications.preferences.enabledTypesCount' as never, { count: 0 })).toBe(
      '0 notification types enabled',
    );
  });

  it('handles select with a matching and a fallback case', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(t('notifications.status.byState' as never, { state: 'paused' })).toBe('Paused');
    expect(t('notifications.status.byState' as never, { state: 'unknown-state' })).toBe('Unknown');
  });

  it('throws in dev mode when a param is missing', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(() => t('notifications.preferences.greeting' as never, {})).toThrow(/name/);
  });

  it('falls back to the raw placeholder in prod mode when a param is missing', () => {
    const t = createTranslator(messages, { isDev: false });
    expect(t('notifications.preferences.greeting' as never, {})).toBe('Hello {name}');
  });

  it('throws in dev mode for an unknown key', () => {
    const t = createTranslator(messages, { isDev: true });
    expect(() => t('notifications.nope' as never)).toThrow(/nope/);
  });

  it('falls back to the key itself in prod mode for an unknown key', () => {
    const t = createTranslator(messages, { isDev: false });
    expect(t('notifications.nope' as never)).toBe('notifications.nope');
  });

  it('supports runtime locale/catalog swapping via a second translator instance (test doubling)', () => {
    const frenchDouble = {
      notifications: { preferences: { title: 'Préférences de notification' } },
    };
    const tEn = createTranslator(messages, { isDev: true });
    const tFr = createTranslator(frenchDouble, { isDev: true });
    expect(tEn('notifications.preferences.title' as never)).toBe('Notification Preferences');
    expect(tFr('notifications.preferences.title' as never)).toBe('Préférences de notification');
  });
});
