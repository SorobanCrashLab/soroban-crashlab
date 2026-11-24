import { describe, expect, it } from 'vitest';
import { isSlashCommandPrefix, parseSlashCommand, SLASH_COMMANDS } from './slash-commands';

describe('slash command parsing', () => {
  it('parses known commands and arguments', () => {
    expect(parseSlashCommand('/evidence run run-001')).toMatchObject({
      command: 'evidence',
      args: ['run', 'run-001'],
    });
    expect(parseSlashCommand('/callout warning "Check this"')).toMatchObject({
      command: 'callout',
      args: ['warning', 'Check this'],
    });
  });

  it('is case-insensitive and tolerates leading whitespace', () => {
    expect(parseSlashCommand('  /Template postmortem')?.command).toBe('template');
  });

  it('returns null for unknown or non-command lines', () => {
    expect(parseSlashCommand('ordinary text')).toBeNull();
    expect(parseSlashCommand('/unknown')).toBeNull();
    expect(parseSlashCommand('')).toBeNull();
  });

  it('recognizes in-progress prefixes for the command menu', () => {
    expect(isSlashCommandPrefix('/evi')).toBe(true);
    expect(isSlashCommandPrefix('/evidence run run-001')).toBe(true);
    expect(isSlashCommandPrefix('text /evidence')).toBe(false);
  });

  it('exposes every required command', () => {
    expect(SLASH_COMMANDS.map((item) => item.name)).toEqual([
      'evidence',
      'mermaid',
      'callout',
      'table',
      'checklist',
      'template',
    ]);
  });
});
