import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateTraineeInput, UpdateTraineeInput } from "./schema";
import { normalizePhone } from "../hotspot/hotspot.config";
import { assertPhoneNotTaken } from "../../lib/personUniqueness";

export class TraineesService {
  async getTrainees(params: { search?: string; page?: number; limit?: number; sortField?: string; sortDir?: "asc" | "desc" }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: any = { type: "trainee" };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const traineeSortFields: Record<string, any> = {
      name: { name: params.sortDir ?? "asc" },
      phone: { phone: params.sortDir ?? "asc" },
      source: { source: params.sortDir ?? "asc" },
      createdAt: { createdAt: params.sortDir ?? "desc" },
    };
    const orderBy = traineeSortFields[params.sortField ?? "createdAt"] ?? { createdAt: "desc" };

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

  async createTrainee(data: CreateTraineeInput) {
    // Cross-table uniqueness: a phone belongs to exactly one of
    // subscriber / trainee / employee. Plain walk-in visitor rows
    // (auto-created, no subscription) intentionally do NOT conflict.
    const phone = await assertPhoneNotTaken(data.phone);

    const visitor = await prisma.visitor.create({
      data: {
        name: data.name,
        phone,
        type: "trainee",
        source: data.source ?? null,
        notes: data.notes ?? null,
      },
    });

    return visitor;
  }

  async updateTrainee(id: string, data: UpdateTraineeInput) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Trainee not found");
    }
    if (visitor.type !== "trainee") {
      throw new ApiError(400, "Visitor is not a trainee");
    }

    // If changing phone, run the cross-table uniqueness guard (covers
    // subscribers, other trainees, and the employee roster).
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

  async deleteTrainee(id: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new ApiError(404, "Trainee not found");
    }
    if (visitor.type !== "trainee") {
      throw new ApiError(400, "Visitor is not a trainee");
    }

    // Check for active sessions
    const activeSession = await prisma.session.findFirst({
      where: { visitorId: id, checkOut: null },
    });
    if (activeSession) {
      throw new ApiError(400, "Cannot delete trainee with active session");
    }

    await prisma.visitor.delete({ where: { id } });
  }
}

export const traineesService = new TraineesService();
