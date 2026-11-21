// WIP scaffold for issue #2277.
import { z } from "zod";
import { defineRouteViewSchema } from "../schema";

const campaignsViewSchema = z.object({
  search: z.string().default(""),
  sort: z.enum(["name", "createdAt", "status"]).default("createdAt"),
});

export type CampaignsView = z.infer<typeof campaignsViewSchema>;

export const campaignsRouteView = defineRouteViewSchema<CampaignsView>({
  version: 1,
  schema: campaignsViewSchema,
  defaults: { search: "", sort: "createdAt" },
});
