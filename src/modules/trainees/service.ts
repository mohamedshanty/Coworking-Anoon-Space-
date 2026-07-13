import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateTraineeInput, UpdateTraineeInput } from "./schema";

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
    // Check if a visitor with this phone already exists
    const existing = await prisma.visitor.findFirst({
      where: { phone: data.phone },
    });

    if (existing) {
      throw new ApiError(
        409,
        `يوجد شخص مسجل مسبقاً بنفس رقم الهاتف: ${existing.name}`
      );
    }

    const visitor = await prisma.visitor.create({
      data: {
        name: data.name,
        phone: data.phone,
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

    // If changing phone, check for duplicates
    if (data.phone && data.phone !== visitor.phone) {
      const duplicate = await prisma.visitor.findFirst({
        where: { phone: data.phone, id: { not: id } },
      });
      if (duplicate) {
        throw new ApiError(409, `رقم الهاتف مستخدم بالفعل: ${duplicate.name}`);
      }
    }

    return prisma.visitor.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
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
