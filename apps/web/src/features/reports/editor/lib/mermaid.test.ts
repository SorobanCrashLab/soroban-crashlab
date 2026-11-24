import { describe, expect, it } from 'vitest';
import { mermaidToAccessibleText, safeMermaidText, validateMermaid } from './mermaid';

describe('safe Mermaid text', () => {
  it('accepts supported headers', () => {
    expect(validateMermaid('flowchart TD\n  A --> B').valid).toBe(true);
    expect(validateMermaid('sequenceDiagram\n  A->>B: hello').valid).toBe(true);
  });

  it('rejects raw HTML, unsafe directives and unbalanced quotes', () => {
    expect(validateMermaid('<script>alert(1)</script>').valid).toBe(false);
    expect(validateMermaid('flowchart TD\n  click A "https://example.com"').valid).toBe(false);
    expect(validateMermaid('flowchart TD\n  A["unclosed]').valid).toBe(false);
    expect(validateMermaid('').valid).toBe(false);
  });

  it('strips markup and control characters before rendering', () => {
    expect(safeMermaidText('flowchart TD\r\n  A[Hi<script>x</script>]')).toBe('flowchart TD\n  A[Hix]');
  });

  it('does not let malformed or comment-wrapped markup survive sanitization', () => {
    expect(safeMermaidText('flowchart TD\n  A[<script onload=evil()')).not.toContain('<');
    expect(validateMermaid('flowchart TD\n  <!--x--!> A --> B').valid).toBe(false);
  });

  it('renders a structured text representation', () => {
    const lines = mermaidToAccessibleText('flowchart TD\n  A --> B');
    expect(lines[1]).toContain('leads to');
    expect(mermaidToAccessibleText('sequenceDiagram\n  participant Client\n  Client->>RPC: hi')[1]).toContain('Participant:');
  });
});
