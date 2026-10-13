import { z } from 'zod';

export const analyticsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  wardId: z.uuid().optional(),
  category: z.string().max(60).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;
