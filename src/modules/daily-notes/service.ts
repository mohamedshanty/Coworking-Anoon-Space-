import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { palestineStartOfDay, palestineEndOfDay } from "../../lib/timezone";

export class DailyNotesService {
  async listByDate(dateStr: string) {
    const date = new Date(dateStr);
    const fromDate = palestineStartOfDay(date);
    const toDate = palestineEndOfDay(date);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ApiError(400, "Invalid date format");
    }

    const notes = await prisma.dailyNote.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: "asc" },
    });

    return notes;
  }

  async create(content: string, authorName: string, dateStr: string) {
    const date = new Date(dateStr);
    const normalizedDate = palestineStartOfDay(date);

    if (isNaN(normalizedDate.getTime())) {
      throw new ApiError(400, "Invalid date format");
    }

    if (!content || !content.trim()) {
      throw new ApiError(400, "Content is required");
    }

    return prisma.dailyNote.create({
      data: {
        date: normalizedDate,
        content: content.trim(),
        authorName,
      },
    });
  }

  async delete(id: string, user: { name: string; role: string }) {
    const note = await prisma.dailyNote.findUnique({ where: { id } });
    if (!note) {
      throw new ApiError(404, "Note not found");
    }

    // Admin can delete any note; others can only delete their own
    if (user.role !== "admin" && note.authorName !== user.name) {
      throw new ApiError(403, "You can only delete your own notes");
    }

    return prisma.dailyNote.delete({ where: { id } });
  }

  async listByDateRange(fromDate: Date, toDate: Date) {
    return prisma.dailyNote.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const dailyNotesService = new DailyNotesService();
