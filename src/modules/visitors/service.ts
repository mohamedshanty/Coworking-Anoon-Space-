import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { getEffectiveStatus } from "../../lib/subscription";
import { archivedPersonError, findActivePhoneConflict, phoneConflictError, syncWalletPhone } from "../../lib/person";
import { mergePerson } from "../../lib/mergePerson";
import { deactivateMemberOnAnoonQr, syncMemberToAnoonQr } from "../../lib/anoon-sync";
import { AddNoteInput, ConvertTypeInput, MergePersonsInput, UpdateVisitorInput } from "./schema";

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

  /** Lightweight lookup of the ACTIVE person holding a phone (for UIs that key off other tables). */
  async getByPhone(phone: string) {
    const visitor = await prisma.visitor.findFirst({
      where: { phone, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, phone: true, type: true },
    });
    if (!visitor) {
      throw new ApiError(404, "لا يوجد شخص نشط بهذا الرقم");
    }
    return visitor;
  }

  /**
   * Convert a person's type (ANY → ANY) on the SAME row: the id never
   * changes, so sessions, snack orders, debts, wallet transactions,
   * subscriptions and notes stay attached. Past sessions keep their own
   * sessionType (history/revenue untouched — this method never writes to
   * Session except the active-session guard read).
   *
   * One transaction: Visitor.type update (+ Subscription create when
   * entering subscriber) + PersonAudit entry. Anoon QR sync is
   * fire-and-forget after commit.
   */
  async convertType(
    id: string,
    input: ConvertTypeInput,
    actor?: { id: string; name: string },
  ) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }
    if ((visitor as any).deletedAt) {
      throw new ApiError(400, "هذا الشخص مؤرشف — استعده أولاً قبل تغيير النوع");
    }
    if (input.type === visitor.type) {
      throw new ApiError(400, "الشخص مسجل بهذا النوع مسبقاً — لا يوجد ما يتغير");
    }

    const activeSession = await prisma.session.findFirst({
      where: { visitorId: id, checkOut: null },
      select: { id: true },
    });
    if (activeSession) {
      throw new ApiError(400, "لا يمكن تغيير النوع أثناء وجود جلسة نشطة — سجّل الخروج أولاً");
    }

    const fromType = visitor.type;
    const toType = input.type;
    const enteringSubscriber = toType === "subscriber";
    const leavingSubscriber = fromType === "subscriber";

    // App-level uniqueness (no DB constraint): after the change, the phone
    // must belong to only one MANAGED person. Converting to plain 'visitor'
    // can never violate it (visitors may share); converting to a managed
    // type conflicts when another active managed holder exists.
    // Leaving type "employee" skips the roster lookup: that roster row is the
    // person's own (no Visitor id to exclude by), not another person's.
    if (toType !== "visitor") {
      const conflict = await findActivePhoneConflict(visitor.phone, id, {
        includeRoster: fromType !== "employee",
      });
      if (conflict) {
        throw phoneConflictError(conflict, toType);
      }
    }

    // Entering subscriber: need a live subscription — either an existing one
    // (reactivation, no new row) or the payload to create one now.
    let subscriptionPayload: NonNullable<ConvertTypeInput["subscription"]> | null = null;
    if (enteringSubscriber) {
      const liveSub = await prisma.subscription.findFirst({
        where: {
          visitorId: id,
          OR: [{ status: { in: ["paused", "renewing"] } }, { status: "active", endDate: { gte: new Date() } }],
        },
        select: { id: true },
      });
      if (!liveSub && !input.subscription) {
        throw new ApiError(400, "التحويل إلى مشترك يتطلب إدخال بيانات الاشتراك");
      }
      subscriptionPayload = input.subscription ?? null;
    }

    const result = await prisma.$transaction(async (tx) => {
      let subscription: any = null;
      let debt: any = null;

      if (subscriptionPayload) {
        const roundedAmount =
          Math.round((subscriptionPayload.amountPaid + Number.EPSILON) * 100) / 100;
        const paymentType = subscriptionPayload.paymentType ?? "full";
        const totalFee =
          paymentType === "installment" && subscriptionPayload.totalFee != null
            ? Math.round((subscriptionPayload.totalFee + Number.EPSILON) * 100) / 100
            : roundedAmount;

        // Expire previous live subscriptions (same rule as renew) so only the
        // new one is live; old rows stay as history.
        await tx.subscription.updateMany({
          where: { visitorId: id, status: { in: ["active", "paused", "renewing"] } },
          data: { status: "expired" },
        });

        subscription = await tx.subscription.create({
          data: {
            visitorId: id,
            packageType: subscriptionPayload.packageType,
            startDate: new Date(subscriptionPayload.startDate),
            endDate: new Date(subscriptionPayload.endDate),
            dailyQuotaHours: subscriptionPayload.dailyQuotaHours,
            daysUsed: 0,
            totalFee,
            amountPaid: roundedAmount,
            status: "active",
          },
        });

        if (paymentType === "installment" && totalFee > roundedAmount) {
          const remaining = Math.round((totalFee - roundedAmount + Number.EPSILON) * 100) / 100;
          debt = await tx.debt.create({
            data: {
              visitorId: id,
              subscriptionId: subscription.id,
              name: visitor.name,
              phone: visitor.phone,
              amount: remaining,
              type: "subscription",
              status: "unpaid",
              createdAt: new Date(),
              note: "متبقي من اشتراك التحويل",
            },
          });
        }
      }

      const updated = await tx.visitor.update({
        where: { id },
        data: { type: toType },
      });

      await tx.personAudit.create({
        data: {
          visitorId: id,
          action: "convert-type",
          fromType,
          toType,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          detail: subscription ? `subscription:${subscription.id}` : null,
        },
      });

      return { updated, subscription, debt };
    });

    // Anoon QR (fire-and-forget, never fails the conversion).
    if (enteringSubscriber) {
      const sub = result.subscription ??
        (await prisma.subscription.findFirst({
          where: { visitorId: id },
          orderBy: { startDate: "desc" },
        }));
      void syncMemberToAnoonQr({
        name: visitor.name,
        phone: visitor.phone,
        packageType: (sub as any)?.packageType ?? "monthly",
        startDate: (sub as any)?.startDate ?? new Date(),
      });
    } else if (leavingSubscriber) {
      void deactivateMemberOnAnoonQr(visitor.phone);
    } else if (toType === "trainee" || toType === "employee") {
      void syncMemberToAnoonQr({
        name: visitor.name,
        phone: visitor.phone,
        packageType: "monthly",
        startDate: new Date(),
        type: toType as "trainee" | "employee",
      });
    }

    return {
      id: result.updated.id,
      name: result.updated.name,
      phone: result.updated.phone,
      type: result.updated.type,
      fromType,
      subscription: result.subscription
        ? { id: result.subscription.id, packageType: result.subscription.packageType }
        : null,
    };
  }

  /**
   * Merge two person records (re-link + archive source). Thin wrapper over
   * lib/mergePerson with an audit entry, exposed for the convert-type
   * 409 → merge offer in the UI.
   */
  async mergePersons(input: MergePersonsInput, actor?: { id: string; name: string }) {
    const summary = await mergePerson(input.sourceId, input.targetId);
    if (!summary.noop) {
      await prisma.personAudit.create({
        data: {
          visitorId: summary.targetId,
          action: "merge",
          fromType: summary.source.type,
          toType: summary.target.type,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          detail: `source:${summary.sourceId} moved:${JSON.stringify(summary.moved)}`,
        },
      });
    }
    return summary;
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
