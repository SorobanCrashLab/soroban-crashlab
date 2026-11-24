// WIP scaffold for issue #2277.
import { z } from "zod";
import { defineRouteViewSchema } from "../schema";

const analyticsViewSchema = z.object({
  timeRange: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  metric: z.string().default("crash-rate"),
});

export type AnalyticsView = z.infer<typeof analyticsViewSchema>;

export const analyticsRouteView = defineRouteViewSchema<AnalyticsView>({
  version: 1,
  schema: analyticsViewSchema,
  defaults: { timeRange: "7d", metric: "crash-rate" },
});
