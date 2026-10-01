'use client';

import { useEffect, useId } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

/**
 * Nonce-aware replacement for `NextSSRPlugin` from `@uploadthing/react`
 * (issue #1545, see docs/CSP.md).
 *
 * The upstream plugin emits its bootstrap through
 * `useServerInsertedHTML(() => <script dangerouslySetInnerHTML={...} />)`.
 * Next.js only auto-stamps the nonce onto the scripts it emits itself, so that
 * tag reached the browser with no `nonce` attribute at all. Under the hardened
 * `script-src 'self' 'nonce-...'` policy the browser blocked it, `globalThis.
 * __UPLOADTHING` stayed undefined, and `getRouteConfig()` threw
 * "No config found for endpoint ..." — breaking every artifact upload.
 *
 * Upgrading the dependency is the real fix, but that is out of scope for this
 * change. This reproduces the plugin's behaviour verbatim (same global, same
 * payload, and the `useId()` key that lets React dedupe the tag) while adding
 * the nonce the rest of the app already uses.
 *
 * Delete this in favour of the upstream plugin once a version accepts a nonce.
 */
export function UploadthingSsrConfigScript({
  routerConfig,
  nonce,
}: {
  routerConfig: unknown;
  nonce?: string;
}) {
  const id = useId();

  // The uploader reads this global during render on the client, so it has to be
  // set before any consumer mounts. Upstream assigns during render (a render
  // side effect); an effect is the correct place for it. It still runs before
  // any consumer's own effects, which is what the uploader depends on.
  useEffect(() => {
    (globalThis as unknown as { __UPLOADTHING?: unknown }).__UPLOADTHING = routerConfig;
  }, [routerConfig]);

  useServerInsertedHTML(() => {
    const html = `globalThis.__UPLOADTHING = ${JSON.stringify(routerConfig)};`;
    // Rendered via the raw HTML string rather than a <script> child so the
    // nonce attribute cannot be dropped by a serializer that ignores it.
    return (
      <script
        id={id}
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });

  return null;
}
