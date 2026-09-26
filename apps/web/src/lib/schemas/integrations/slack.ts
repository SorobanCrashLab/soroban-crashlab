import { z } from 'zod';

export const SlackInteractionPayloadSchema = z.object({
  type: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string().optional(),
  }).passthrough(),
  actions: z.array(z.object({
    action_id: z.string(),
  }).passthrough()).min(1),
  response_url: z.string().optional(),
}).strip();
