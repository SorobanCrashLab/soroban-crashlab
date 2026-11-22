// WIP scaffold for issue #2277.
import { z } from "zod";
import { defineRouteViewSchema } from "../schema";

const runDetailViewSchema = z.object({
  panel: z.enum(["overview", "logs", "artifacts", "sequence"]).default("overview"),
});

export type RunDetailView = z.infer<typeof runDetailViewSchema>;

export const runDetailRouteView = defineRouteViewSchema<RunDetailView>({
  version: 1,
  schema: runDetailViewSchema,
  defaults: { panel: "overview" },
});
