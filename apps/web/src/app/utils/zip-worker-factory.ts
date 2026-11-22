/**
 * Browser worker factory for artifact bundling (#1618).
 *
 * Kept in its own module because `new Worker(new URL('./zip-worker.ts',
 * import.meta.url))` is bundler syntax: the literal `new URL` form is what lets
 * webpack/turbopack emit `zip-worker.ts` as its own worker chunk, and
 * `import.meta` is a module-only feature. Both are why the client in
 * `artifact-zip-worker.ts` takes the factory as an argument instead of
 * importing this file.
 */

import { setZipWorkerFactory, type ZipWorkerLike } from './artifact-zip-worker';

/**
 * The one bundler-recognised worker construction in the app.
 *
 * The `new URL(..., import.meta.url)` argument must stay a static literal; a
 * computed URL would be treated as an external script and silently fail to
 * resolve the worker's imports at runtime.
 */
export function createZipWorker(): ZipWorkerLike {
    return new Worker(new URL('./zip-worker.ts', import.meta.url)) as unknown as ZipWorkerLike;
}

/**
 * Registers the browser worker so `generateRunArtifactZipWithProgress` uses it.
 *
 * Safe to call during SSR or prerender: this only stores the factory, and the
 * worker itself is not constructed until a download starts.
 */
export function registerZipWorker(): void {
    setZipWorkerFactory(createZipWorker);
}
