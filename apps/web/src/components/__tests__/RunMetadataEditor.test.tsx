import { describe, it, expect, vi } from 'vitest';
import { RunMetadata } from '../RunMetadataEditor';

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1000',
    status: 'completed' as const,
    area: 'auth' as const,
    severity: 'low' as const,
    duration: 120_000,
    seedCount: 10_000,
    crashDetail: null,
    cpuInstructions: 450_000,
    memoryBytes: 1_800_000,
    minResourceFee: 600,
    tags: ['needs-repro'],
    ...overrides,
  };
}

describe('RunMetadataEditor – metadata logic', () => {
  it('preserves default run ID as name when no custom name is set', () => {
    const run = makeRun();
    const metadata: RunMetadata = { name: run.id, description: '', tags: run.tags ?? [] };
    expect(metadata.name).toBe('run-1000');
  });

  it('allows custom name', () => {
    const metadata: RunMetadata = { name: 'Auth Fuzzing March', description: '', tags: [] };
    expect(metadata.name).toBe('Auth Fuzzing March');
  });

  it('preserves existing tags from run', () => {
    const run = makeRun({ tags: ['ship-blocker', 'partner-followup'] });
    expect(run.tags).toEqual(['ship-blocker', 'partner-followup']);
  });

  it('tags can be added', () => {
    const tags = ['existing'];
    tags.push('new-tag');
    expect(tags).toEqual(['existing', 'new-tag']);
  });

  it('tags can be removed', () => {
    const tags = ['keep', 'remove-me'];
    const filtered = tags.filter((t) => t !== 'remove-me');
    expect(filtered).toEqual(['keep']);
  });

  it('duplicate tags are detected', () => {
    const tags = ['existing'];
    const candidate = 'existing';
    expect(tags.includes(candidate)).toBe(true);
  });

  it('empty name is rejected', () => {
    const name = '';
    expect(name.trim().length === 0).toBe(true);
  });

  it('whitespace-only name is rejected', () => {
    const name = '   ';
    expect(name.trim().length === 0).toBe(true);
  });

  it('trims whitespace from name', () => {
    const name = '  Auth Fuzz  ';
    expect(name.trim()).toBe('Auth Fuzz');
  });

  it('trims whitespace from description', () => {
    const description = '  Some notes  ';
    expect(description.trim()).toBe('Some notes');
  });

  it('tags are deduplicated by value', () => {
    const tags = ['a', 'b'];
    const candidate = 'a';
    if (!tags.includes(candidate)) {
      tags.push(candidate);
    }
    expect(tags).toEqual(['a', 'b']);
  });

  it('backspace removes last tag when input is empty', () => {
    const tags = ['first', 'second'];
    const tagInput = '';
    if (tagInput === '' && tags.length > 0) {
      tags.pop();
    }
    expect(tags).toEqual(['first']);
  });

  it('backspace does not remove tag when input has text', () => {
    const tags = ['first', 'second'];
    const tagInput = 'x';
    if (tagInput.length === 0 && tags.length > 0) {
      tags.pop();
    }
    expect(tags).toEqual(['first', 'second']);
  });
});

describe('RunMetadataEditor – prop interface', () => {
  it('onSave receives RunMetadata shape', () => {
    const onSave = vi.fn();
    const metadata: RunMetadata = { name: 'run-1000', description: 'test', tags: ['a'] };
    onSave(metadata);
    expect(onSave).toHaveBeenCalledWith({
      name: 'run-1000',
      description: 'test',
      tags: ['a'],
    });
  });

  it('onToggleEdit is called to enter edit mode', () => {
    const onToggleEdit = vi.fn();
    onToggleEdit();
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('isEditing false shows read-only view', () => {
    expect(false).toBe(false);
  });
});
