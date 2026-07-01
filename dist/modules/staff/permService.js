"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsService = exports.PermissionsService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
const ALL_PAGES = [
    "الرئيسية", "داخل المساحة", "السجل", "المشتركون", "السناكس", "المشروبات",
    "المخزون", "المصروفات", "المديونيات", "القاعات", "الدورات", "المتابعة",
    "التقارير", "الإعدادات",
];
class PermissionsService {
    async getMatrix(staffId) {
        const staff = await prisma_1.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
        if (!staff)
            throw new ApiError_1.ApiError(404, "Staff member not found");
        const existing = await prisma_1.prisma.permission.findMany({
            where: { staffId },
            select: { pageKey: true, canView: true, canEdit: true, canDelete: true },
        });
        const map = new Map(existing.map((p) => [p.pageKey, p]));
        return ALL_PAGES.map((pageKey) => {
            const perm = map.get(pageKey);
            return {
                pageKey,
                canView: perm?.canView ?? false,
                canEdit: perm?.canEdit ?? false,
                canDelete: perm?.canDelete ?? false,
            };
        });
    }
    async updateMatrix(staffId, data) {
        const staff = await prisma_1.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
        if (!staff)
            throw new ApiError_1.ApiError(404, "Staff member not found");
        const ops = data.permissions.map((p) => prisma_1.prisma.permission.upsert({
            where: { staffId_pageKey: { staffId, pageKey: p.pageKey } },
            create: { staffId, pageKey: p.pageKey, canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
            update: { canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
        }));
        await prisma_1.prisma.$transaction(ops);
        return this.getMatrix(staffId);
    }
}
exports.PermissionsService = PermissionsService;
exports.permissionsService = new PermissionsService();
