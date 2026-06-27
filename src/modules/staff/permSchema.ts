import { z } from "zod";

const permissionEntrySchema = z.object({
  pageKey: z.string(),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export const updatePermissionsSchema = z.object({
  permissions: z.array(permissionEntrySchema).min(1, "At least one permission entry required"),
});

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
