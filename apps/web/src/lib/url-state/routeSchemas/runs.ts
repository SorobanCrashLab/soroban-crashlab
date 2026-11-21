// WIP scaffold for issue #2277.
import { z } from "zod";
import { defineRouteViewSchema } from "../schema";

const runsViewSchema = z.object({
  search: z.string().default(""),
  status: z.array(z.string()).default([]),
  page: z.number().int().min(1).default(1),
});

export type RunsView = z.infer<typeof runsViewSchema>;

export const runsRouteView = defineRouteViewSchema<RunsView>({
  version: 1,
  schema: runsViewSchema,
  defaults: { search: "", status: [], page: 1 },
});
