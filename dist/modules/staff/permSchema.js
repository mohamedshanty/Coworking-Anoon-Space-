"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePermissionsSchema = void 0;
const zod_1 = require("zod");
const permissionEntrySchema = zod_1.z.object({
    pageKey: zod_1.z.string(),
    canView: zod_1.z.boolean(),
    canEdit: zod_1.z.boolean(),
    canDelete: zod_1.z.boolean(),
});
exports.updatePermissionsSchema = zod_1.z.object({
    permissions: zod_1.z.array(permissionEntrySchema).min(1, "At least one permission entry required"),
});
