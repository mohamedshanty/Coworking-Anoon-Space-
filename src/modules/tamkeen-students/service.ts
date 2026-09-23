import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateTamkeenStudentInput, ImportTamkeenStudentRowInput, UpdateTamkeenStudentInput } from "./schema";
import { normalizePhone } from "../hotspot/hotspot.config";
import { assertPhoneNotTaken } from "../../lib/personUniqueness";

export type TamkeenStudentImportPreviewRow = {
  rowNumber: number;
  name: string;
  phone: string;
};

export type TamkeenStudentImportUpdateRow = TamkeenStudentImportPreviewRow & {
  existingId: string;
  existingName: string;
};

export type TamkeenStudentImportRejectedRow = TamkeenStudentImportPreviewRow & {
  reason: string;
};

export type TamkeenStudentImportPreview = {
  toCreate: TamkeenStudentImportPreviewRow[];
  toUpdate: TamkeenStudentImportUpdateRow[];
  rejected: TamkeenStudentImportRejectedRow[];
  summary: { total: number; toCreate: number; toUpdate: number; rejected: number };
};

export class TamkeenStudentsService {
  async getTamkeenStudents(params: { search?: string; page?: number; limit?: number; sortField?: string; sortDir?: "asc" | "desc" }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: any = { type: "tamkeen" };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const sortFields: Record<string, any> = {
      name: { name: params.sortDir ?? "asc" },
      phone: { phone: params.sortDir ?? "asc" },
      source: { source: params.sortDir ?? "asc" },
      createdAt: { createdAt: params.sortDir ?? "desc" },
    };
    const orderBy = sortFields[params.sortField ?? "createdAt"] ?? { createdAt: "desc" };

    const [items, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        include: {
          _count: { select: { sessions: true } },
          sessions: {
            orderBy: { checkIn: "desc" },
            take: 1,
            select: { checkIn: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.visitor.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async createTamkeenStudent(data: CreateTamkeenStudentInput) {
    // Cross-table uniqueness: a phone belongs to exactly one of
    // subscriber / trainee / Tamkeen student / employee. Plain walk-in
    // visitor rows (auto-created, no subscription) intentionally do NOT
    // conflict.
    const phone = await assertPhoneNotTaken(data.phone);

    const visitor = await prisma.visitor.create({
      data: {
        name: data.name,
        phone,
        type: "tamkeen",
        source: data.source ?? null,
        notes: data.notes ?? null,
      },
    });

    return visitor;
  }

  async updateTamkeenStudent(id: string, data: UpdateTamkeenStudentInput) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Tamkeen student not found");
    }
    if (visitor.type !== "tamkeen") {
      throw new ApiError(400, "Visitor is not a Tamkeen student");
    }

    // If changing phone, run the cross-table uniqueness guard (covers
    // subscribers, trainees, other Tamkeen students, and the employee
    // roster).
    let newPhone: string | undefined;
    if (data.phone) {
      const normalized = normalizePhone(data.phone);
      if (!normalized) {
        throw new ApiError(400, "Invalid phone number — expected format 05XXXXXXXX");
      }
      if (normalized !== visitor.phone) {
        newPhone = await assertPhoneNotTaken(normalized);
      }
    }

    return prisma.visitor.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(newPhone !== undefined ? { phone: newPhone } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  async deleteTamkeenStudent(id: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Tamkeen student not found");
    }
    if (visitor.type !== "tamkeen") {
      throw new ApiError(400, "Visitor is not a Tamkeen student");
    }

    // Check for active sessions
    const activeSession = await prisma.session.findFirst({
      where: { visitorId: id, checkOut: null },
    });
    if (activeSession) {
      throw new ApiError(400, "Cannot delete Tamkeen student with active session");
    }

    await prisma.visitor.delete({ where: { id } });
  }

  /**
   * Phase 1 (validate): normalize phones with the shared hotspot
   * normalizePhone, flag missing/invalid + in-file duplicates, then
   * cross-check against the other person tables:
   * - phone already a Tamkeen student → update (refresh name), not an error
   * - phone a subscriber, trainee, or employee → reject that row only
   * Plain walk-in visitor rows never conflict (same rule as
   * personUniqueness.ts).
   */
  async validateTamkeenStudentImport(rows: ImportTamkeenStudentRowInput[]): Promise<TamkeenStudentImportPreview> {
    const toCreate: TamkeenStudentImportPreviewRow[] = [];
    const toUpdate: TamkeenStudentImportUpdateRow[] = [];
    const rejected: TamkeenStudentImportRejectedRow[] = [];

    // Pass 1: shape + phone normalization + in-file duplicates.
    const candidates: (TamkeenStudentImportPreviewRow & { index: number })[] = [];
    const seenPhones = new Map<string, number>();
    rows.forEach((row, i) => {
      const rowNumber = row.rowNumber ?? i + 1;
      const name = (row.name ?? "").replace(/\s+/g, " ").trim();
      const rawPhone = (row.phone ?? "").trim();
      const phone = rawPhone ? normalizePhone(rawPhone) : null;
      if (!name) {
        rejected.push({ rowNumber, name, phone: rawPhone, reason: "الاسم مفقود" });
        return;
      }
      if (!phone) {
        rejected.push({
          rowNumber,
          name,
          phone: rawPhone,
          reason: "رقم هاتف مفقود أو غير صالح — الصيغة المتوقعة 05XXXXXXXX",
        });
        return;
      }
      if (seenPhones.has(phone)) {
        rejected.push({ rowNumber, name, phone, reason: "رقم مكرر داخل الملف" });
        return;
      }
      seenPhones.set(phone, rowNumber);
      candidates.push({ rowNumber, name, phone, index: i });
    });

    if (candidates.length === 0) {
      return {
        toCreate,
        toUpdate,
        rejected,
        summary: { total: rows.length, toCreate: 0, toUpdate: 0, rejected: rejected.length },
      };
    }

    const phones = [...new Set(candidates.map((c) => c.phone))];

    // Batch the cross-table checks (same predicates as personUniqueness.ts).
    const [existingTamkeen, existingSubscribers, existingTrainees, existingEmployees] = await Promise.all([
      prisma.visitor.findMany({
        where: { phone: { in: phones }, type: "tamkeen" },
        select: { id: true, phone: true, name: true },
      }),
      prisma.visitor.findMany({
        where: {
          phone: { in: phones },
          OR: [{ type: "subscriber" }, { subscriptions: { some: {} } }],
        },
        select: { id: true, phone: true },
      }),
      prisma.visitor.findMany({
        where: { phone: { in: phones }, type: "trainee" },
        select: { id: true, phone: true },
      }),
      prisma.employeeRoster.findMany({
        where: { phone: { in: phones } },
        select: { id: true, phone: true },
      }),
    ]);

    const tamkeenByPhone = new Map(existingTamkeen.map((t) => [t.phone, t]));
    const subscriberPhones = new Set(existingSubscribers.map((s) => s.phone));
    const traineePhones = new Set(existingTrainees.map((t) => t.phone));
    const employeePhones = new Set(existingEmployees.map((e) => e.phone));

    // Keep input order in the preview.
    candidates.sort((a, b) => a.index - b.index);
    for (const c of candidates) {
      const existing = tamkeenByPhone.get(c.phone);
      if (existing) {
        toUpdate.push({
          rowNumber: c.rowNumber,
          name: c.name,
          phone: c.phone,
          existingId: existing.id,
          existingName: existing.name,
        });
        continue;
      }
      if (subscriberPhones.has(c.phone)) {
        rejected.push({
          rowNumber: c.rowNumber,
          name: c.name,
          phone: c.phone,
          reason: "رقم الهاتف مسجل لمشترك — لا يمكن استيراده كطالب تمكين",
        });
        continue;
      }
      if (traineePhones.has(c.phone)) {
        rejected.push({
          rowNumber: c.rowNumber,
          name: c.name,
          phone: c.phone,
          reason: "رقم الهاتف مسجل كمتدرب — لا يمكن استيراده كطالب تمكين",
        });
        continue;
      }
      if (employeePhones.has(c.phone)) {
        rejected.push({
          rowNumber: c.rowNumber,
          name: c.name,
          phone: c.phone,
          reason: "رقم الهاتف مسجل كموظف — لا يمكن استيراده كطالب تمكين",
        });
        continue;
      }
      toCreate.push({ rowNumber: c.rowNumber, name: c.name, phone: c.phone });
    }

    // Present rejected rows in file order too.
    rejected.sort((a, b) => a.rowNumber - b.rowNumber);

    return {
      toCreate,
      toUpdate,
      rejected,
      summary: {
        total: rows.length,
        toCreate: toCreate.length,
        toUpdate: toUpdate.length,
        rejected: rejected.length,
      },
    };
  }

  /**
   * Phase 2 (commit): re-validate (guards against a stale preview) then
   * create/update the accepted rows in a single transaction.
   */
  async commitTamkeenStudentImport(rows: ImportTamkeenStudentRowInput[]) {
    const preview = await this.validateTamkeenStudentImport(rows);

    if (preview.toCreate.length > 0 || preview.toUpdate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const c of preview.toCreate) {
          await tx.visitor.create({
            data: { name: c.name, phone: c.phone, type: "tamkeen" },
          });
        }
        for (const u of preview.toUpdate) {
          await tx.visitor.update({
            where: { id: u.existingId },
            data: { name: u.name },
          });
        }
      });
    }

    return {
      created: preview.toCreate.length,
      updated: preview.toUpdate.length,
      rejected: preview.rejected,
      summary: {
        total: rows.length,
        created: preview.toCreate.length,
        updated: preview.toUpdate.length,
        rejected: preview.rejected.length,
      },
    };
  }
}

export const tamkeenStudentsService = new TamkeenStudentsService();
