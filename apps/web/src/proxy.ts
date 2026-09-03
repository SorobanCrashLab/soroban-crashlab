// Next.js 16 requires edge middleware to live in `proxy.ts`; keep a thin
// re-export so existing `from './proxy'` imports keep working.
export { proxy, generateCorrelationId } from "./rate-limit";

export const config = {
  matcher: "/api/:path*",
};

