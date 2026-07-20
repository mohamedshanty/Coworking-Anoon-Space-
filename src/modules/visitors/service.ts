import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
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
      followUpStatus: visitor.followUpStatus,
      followUpAt: visitor.followUpAt?.toISOString() ?? null,
      createdAt: visitor.createdAt.toISOString(),
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
        status: sub.status,
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

    const updated = await prisma.visitor.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.followUpStatus !== undefined && { followUpStatus: data.followUpStatus }),
        ...(data.followUpStatus === "contacted" && { followUpAt: new Date() }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
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
