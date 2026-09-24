import { buildOpenApiSpec } from '@/lib/openapi/spec';

export const dynamic = 'force-static';

export default function ApiDocsPage() {
  const spec = buildOpenApiSpec();
  const paths = Object.entries(spec.paths) as Array<[string, Record<string, { summary?: string; tags?: string[]; security?: unknown[] }>]>;
  const grouped = new Map<string, Array<{ path: string; method: string; summary: string }>>();
  for (const [path, methods] of paths) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] ?? 'other';
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag)!.push({ path, method: method.toUpperCase(), summary: op.summary ?? '' });
    }
  }

  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">API reference</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Machine-readable contract: <a className="link" href="/api/openapi">openapi.json</a>. Success envelope{' '}
        <code className="code-text">{'{ data, total? }'}</code>; errors <code className="code-text">{'{ error, code? }'}</code>.
        Auth: <code className="code-text">Authorization: Bearer &lt;token&gt;</code> with scopes <code className="code-text">read</code>/
        <code className="code-text">write</code> (tokens look like <code className="code-text">scl_live_*</code>). Pagination is
        keyset-based via opaque <code className="code-text">cursor</code> + <code className="code-text">limit</code>.
      </p>
      {[...grouped.entries()].map(([tag, ops]) => (
        <section key={tag} aria-labelledby={`api-${tag}`} className="mt-8">
          <h2 id={`api-${tag}`} className="heading-section capitalize">{tag}</h2>
          <ul className="mt-3 space-y-1.5">
            {ops.map((op) => (
              <li key={`${op.method}-${op.path}`} className="flex items-baseline gap-3 text-sm">
                <span className="code-text font-bold w-14 shrink-0">{op.method}</span>
                <code className="code-text">{op.path}</code>
                <span className="text-meta truncate">{op.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
