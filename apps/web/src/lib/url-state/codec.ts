// WIP scaffold for issue #2277. No compression for large state yet — see
// apps/web/src/app/url-state-codec.ts for the existing (runs-only) compressed codec this
// should eventually generalize.
import { canonicalize } from "./canonicalize";
import { applyMigration } from "./migrations";
import type { RouteViewSchema } from "./schema";

export function encodeRouteView<T extends Record<string, unknown>>(
  routeId: string,
  config: RouteViewSchema<T>,
  value: T,
): string {
  const canonical = canonicalize(value, config.defaults);
  const params = new URLSearchParams();
  params.set("v", String(config.version));
  params.set("s", encodeURIComponent(JSON.stringify(canonical)));
  return params.toString();
}

export function decodeRouteView<T>(
  routeId: string,
  config: RouteViewSchema<T>,
  search: string,
): T {
  const params = new URLSearchParams(search);
  const versionStr = params.get("v");
  const encoded = params.get("s");

  if (!versionStr || !encoded) return config.defaults;

  try {
    let raw = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    const version = Number(versionStr);
    if (version < config.version) {
      raw = applyMigration(routeId, version, raw);
    }
    const parsed = config.schema.safeParse({ ...config.defaults, ...raw });
    return parsed.success ? parsed.data : config.defaults;
  } catch {
    return config.defaults;
  }
}
