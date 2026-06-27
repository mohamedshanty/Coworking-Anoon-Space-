import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { UpdatePermissionsInput } from "./permSchema";

const ALL_PAGES = [
  "الرئيسية", "داخل المساحة", "السجل", "المشتركون", "السناكس", "المشروبات",
  "المخزون", "المصروفات", "المديونيات", "القاعات", "الدورات", "المتابعة",
  "التقارير", "الإعدادات",
];

export class PermissionsService {
  async getMatrix(staffId: string) {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) throw new ApiError(404, "Staff member not found");

    const existing = await prisma.permission.findMany({
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

  async updateMatrix(staffId: string, data: UpdatePermissionsInput) {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) throw new ApiError(404, "Staff member not found");

    const ops = data.permissions.map((p) =>
      prisma.permission.upsert({
        where: { staffId_pageKey: { staffId, pageKey: p.pageKey } },
        create: { staffId, pageKey: p.pageKey, canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
        update: { canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
      })
    );

    await prisma.$transaction(ops);

    return this.getMatrix(staffId);
  }
}

export const permissionsService = new PermissionsService();
