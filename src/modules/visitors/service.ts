import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { getEffectiveStatus } from "../../lib/subscription";
import { archivedPersonError, syncWalletPhone } from "../../lib/person";
import { deactivateMemberOnAnoonQr, syncMemberToAnoonQr } from "../../lib/anoon-sync";
import { AddNoteInput, UpdateVisitorInput } from "./schema";

export class VisitorsService {
  async getById(id: string) {
    const visitor = await prisma.visitor.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { checkIn: "desc" },
          include: { snackOrders: true },
        },
        subscriptions: {
          orderBy: { startDate: "desc" },
        },
        debts: {
          orderBy: { createdAt: "desc" },
        },
        visitorNotes: {
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }

    return {
      id: visitor.id,
      name: visitor.name,
      phone: visitor.phone,
      type: visitor.type,
      source: visitor.source,
      notes: visitor.notes,
      lastVisit: visitor.lastVisit?.toISOString() ?? null,
      visitCount: (visitor as any).visitCount ?? visitor._count.sessions,
      followUpStatus: visitor.followUpStatus,
      followUpAt: visitor.followUpAt?.toISOString() ?? null,
      createdAt: visitor.createdAt.toISOString(),
      deletedAt: (visitor as any).deletedAt
        ? ((visitor as any).deletedAt as Date).toISOString()
        : null,
      isArchived: !!(visitor as any).deletedAt,
      sessionCount: visitor._count.sessions,
      sessions: visitor.sessions.map((s) => ({
        id: s.id,
        sessionType: s.sessionType,
        checkIn: s.checkIn.toISOString(),
        checkOut: s.checkOut?.toISOString() ?? null,
        amount: Number(s.amount),
        hourlyRate: s.hourlyRate != null ? Number(s.hourlyRate) : null,
        paymentStatus: s.paymentStatus,
        paymentMethod: s.paymentMethod,
        notes: s.notes,
        discountAmount: Number(s.discountAmount),
        calculatedPrice: s.calculatedPrice != null ? Number(s.calculatedPrice) : null,
        finalPrice: s.finalPrice != null ? Number(s.finalPrice) : null,
      })),
      subscriptions: visitor.subscriptions.map((sub) => ({
        id: sub.id,
        packageType: sub.packageType,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate.toISOString(),
        dailyQuotaHours: sub.dailyQuotaHours,
        daysUsed: sub.daysUsed,
        amountPaid: Number(sub.amountPaid),
        status: getEffectiveStatus(sub),
      })),
      debts: visitor.debts.map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        amount: Number(d.amount),
        type: d.type,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        collectedAt: d.collectedAt?.toISOString() ?? null,
        note: d.note,
      })),
      visitorNotes: visitor.visitorNotes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async update(id: string, data: UpdateVisitorInput) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }
    if ((visitor as any).deletedAt) {
      throw new ApiError(400, "هذا الشخص مؤرشف — استعده أولاً قبل التعديل");
    }
    // NOTE: `type` is intentionally NOT editable here. Type changes go only
    // through the convert-type operation (with uniqueness checks), never raw.

    const newPhone = data.phone !== undefined && data.phone !== visitor.phone ? data.phone : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      if (newPhone !== undefined || data.name !== undefined) {
        await syncWalletPhone(tx as any, {
          oldPhone: visitor.phone,
          newPhone: newPhone ?? visitor.phone,
          ...(data.name !== undefined ? { newName: data.name } : {}),
        });
      }
      return tx.visitor.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(newPhone !== undefined && { phone: newPhone }),
          ...(data.source !== undefined && { source: data.source }),
          ...(data.followUpStatus !== undefined && { followUpStatus: data.followUpStatus }),
          ...(data.followUpStatus === "contacted" && { followUpAt: new Date() }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });
    });

    return {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      type: updated.type,
      source: updated.source,
      notes: updated.notes,
      lastVisit: updated.lastVisit?.toISOString() ?? null,
      followUpStatus: updated.followUpStatus,
      followUpAt: updated.followUpAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * SOFT DELETE (archive). Only sets `deletedAt` — sessions, snack orders,
   * debts, wallet transactions, subscriptions and notes stay intact.
   * The person-pointing FKs are Restrict, so history can never be wiped.
   * Returns debt/wallet info so the confirmation dialog can warn.
   */
  async archive(id: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }
    if ((visitor as any).deletedAt) {
      return this.archiveInfo(visitor as any);
    }

    const activeSession = await prisma.session.findFirst({
      where: { visitorId: id, checkOut: null },
      select: { id: true },
    });
    if (activeSession) {
      throw new ApiError(400, "لا يمكن أرشفة شخص لديه جلسة نشطة — سجّل خروجه أولاً");
    }

    await prisma.visitor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Tell Anoon QR to DEACTIVATE (not delete) its copy, fire-and-forget,
    // so a later restore reactivates the same record.
    void deactivateMemberOnAnoonQr(visitor.phone);

    const refreshed = await prisma.visitor.findUnique({ where: { id } });
    return this.archiveInfo(refreshed as any);
  }

  private async archiveInfo(visitor: {
    id: string;
    name: string;
    phone: string;
    type: string;
    deletedAt: Date | null;
  }) {
    const [unpaidDebts, wallet] = await Promise.all([
      prisma.debt.findMany({
        where: { visitorId: visitor.id, status: "unpaid" },
        select: { amount: true },
      }),
      prisma.snackWallet.findUnique({
        where: { phone: visitor.phone },
        select: { id: true, balance: true },
      }),
    ]);
    const debtTotal =
      Math.round(
        (unpaidDebts.reduce((sum, d) => sum + Number(d.amount), 0) + Number.EPSILON) * 100,
      ) / 100;
    return {
      id: visitor.id,
      name: visitor.name,
      phone: visitor.phone,
      type: visitor.type,
      deletedAt: visitor.deletedAt ? visitor.deletedAt.toISOString() : null,
      outstandingDebts: { total: debtTotal, count: unpaidDebts.length },
      walletBalance: wallet ? Number(wallet.balance) : 0,
      hasWallet: !!wallet,
    };
  }

  /**
   * Restore an archived person. Fails with a clear 409 if another ACTIVE
   * person now uses the same phone (merge first instead of duplicating).
   */
  async restore(id: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }
    if (!(visitor as any).deletedAt) {
      return {
        id: visitor.id,
        name: visitor.name,
        phone: visitor.phone,
        type: visitor.type,
        deletedAt: null,
      };
    }

    const clash = await prisma.visitor.findFirst({
      where: { phone: visitor.phone, deletedAt: null, id: { not: id } },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new ApiError(
        409,
        `يوجد شخص نشط بنفس الرقم (${clash.name}) — ادمج السجلات أولاً بدل الاستعادة`,
      );
    }

    const updated = await prisma.visitor.update({
      where: { id },
      data: { deletedAt: null },
    });

    // Best-effort: reactivate the Anoon QR copy for managed types.
    if (updated.type === "trainee" || updated.type === "employee") {
      void syncMemberToAnoonQr({
        name: updated.name,
        phone: updated.phone,
        packageType: "monthly",
        startDate: new Date(),
        type: updated.type as "trainee" | "employee",
      });
    } else if (updated.type === "subscriber") {
      const latestSub = await prisma.subscription.findFirst({
        where: { visitorId: id },
        orderBy: { startDate: "desc" },
        select: { packageType: true, startDate: true },
      });
      void syncMemberToAnoonQr({
        name: updated.name,
        phone: updated.phone,
        packageType: latestSub?.packageType ?? "monthly",
        startDate: latestSub?.startDate ?? new Date(),
      });
    }

    return {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      type: updated.type,
      deletedAt: null,
    };
  }

  /** Throw a restore-offer 409 if the phone belongs to an archived person. */
  async assertPhoneNotArchived(phone: string): Promise<void> {
    const archived = await prisma.visitor.findFirst({
      where: { phone, deletedAt: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, phone: true, type: true },
    });
    if (archived) {
      throw archivedPersonError(archived);
    }
  }

  async addNote(visitorId: string, data: AddNoteInput) {
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }

    const note = await prisma.visitorNote.create({
      data: {
        visitorId,
        content: data.content,
      },
    });

    return {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    };
  }

  async deleteNote(noteId: string) {
    const note = await prisma.visitorNote.findUnique({ where: { id: noteId } });
    if (!note) {
      throw new ApiError(404, "Note not found");
    }

    await prisma.visitorNote.delete({ where: { id: noteId } });
    return { success: true };
  }
}

export const visitorsService = new VisitorsService();
