// WIP scaffold for issue #2277 (Deep Linking & URL State Framework). Generalizes the
// existing runs-only codec (apps/web/src/app/url-state-codec.ts); that file is not
// migrated/deprecated yet.
import type { z } from "zod";

export interface RouteViewSchema<T> {
  version: number;
  schema: z.ZodType<T>;
  defaults: T;
}

export function defineRouteViewSchema<T>(config: RouteViewSchema<T>): RouteViewSchema<T> {
  return config;
}
