import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateStaffInput, UpdateStaffInput } from "./schema";

const SALT_ROUNDS = 10;

const staffSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  failedAttempts: true,
  lockedUntil: true,
};

export class StaffService {
  async getAll() {
    return prisma.staff.findMany({
      select: staffSelect,
      orderBy: { name: "asc" },
    });
  }

  async getById(id: string) {
    const staff = await prisma.staff.findUnique({
      where: { id },
      select: staffSelect,
    });
    if (!staff) throw new ApiError(404, "Staff member not found");
    return staff;
  }

  async create(data: CreateStaffInput) {
    const existing = await prisma.staff.findUnique({ where: { username: data.username } });
    if (existing) throw new ApiError(409, "Username already exists");

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    return prisma.staff.create({
      data: {
        name: data.name,
        username: data.username,
        role: data.role,
        passwordHash,
      },
      select: staffSelect,
    });
  }

  async update(id: string, data: UpdateStaffInput) {
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiError(404, "Staff member not found");

    if (data.username && data.username !== staff.username) {
      const dup = await prisma.staff.findUnique({ where: { username: data.username } });
      if (dup) throw new ApiError(409, "Username already exists");
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.password !== undefined) updateData.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    return prisma.staff.update({
      where: { id },
      data: updateData,
      select: staffSelect,
    });
  }

  async delete(id: string) {
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiError(404, "Staff member not found");

    return prisma.staff.delete({ where: { id }, select: staffSelect });
  }
}

export const staffService = new StaffService();
