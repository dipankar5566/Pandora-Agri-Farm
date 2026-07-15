import { z } from 'zod';

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(60),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
