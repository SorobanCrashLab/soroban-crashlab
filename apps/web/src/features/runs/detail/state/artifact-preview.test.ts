import { describe, expect, it } from 'vitest';
import { classifyArtifact, createArtifactPreview, formatArtifactSize } from './artifact-preview';

describe('artifact previews', () => {
  it('classifies text, json, logs and binaries safely', () => {
    expect(classifyArtifact({ name: 'crash.txt' })).toBe('text');
    expect(classifyArtifact({ name: 'summary.json' })).toBe('json');
    expect(classifyArtifact({ name: 'run.log' })).toBe('log');
    expect(classifyArtifact({ name: 'heap.bin', contentType: 'application/octet-stream' })).toBe('binary');
    expect(classifyArtifact({ name: 'blob', contentType: 'application/json' })).toBe('json');
  });

  it('never renders binary content', () => {
    const preview = createArtifactPreview({ name: 'heap.bin', sizeBytes: 900 }, '\x00\x01secret');
    expect(preview.kind).toBe('binary');
    expect(preview.text).not.toContain('secret');
    expect(preview.byteCount).toBe(900);
  });

  it('truncates long text previews with a flag', () => {
    const preview = createArtifactPreview({ name: 'output.log' }, 'x'.repeat(50), 10);
    expect(preview.text).toBe('x'.repeat(10));
    expect(preview.truncated).toBe(true);
    expect(preview.byteCount).toBe(50);
  });

  it('formats sizes consistently', () => {
    expect(formatArtifactSize(null)).toBe('—');
    expect(formatArtifactSize(512)).toBe('512 B');
    expect(formatArtifactSize(2048)).toBe('2.0 KB');
    expect(formatArtifactSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
