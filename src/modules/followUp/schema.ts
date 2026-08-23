import { z } from "zod";

export const dismissFollowUpBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one visitor ID is required"),
});

export type DismissFollowUpBatchInput = z.infer<typeof dismissFollowUpBatchSchema>;
