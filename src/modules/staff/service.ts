import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { normalizePhone } from "../hotspot/hotspot.config";
import { CreateStaffInput, UpdateStaffInput } from "./schema";

const SALT_ROUNDS = 10;

const staffSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  phone: true,
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

    const phone = normalizeOptionalPhone(data.phone);
    if (phone) {
      const dup = await prisma.staff.findUnique({ where: { phone } });
      if (dup) throw new ApiError(409, "Phone number already assigned to another staff member");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    return prisma.staff.create({
      data: {
        name: data.name,
        username: data.username,
        role: data.role,
        passwordHash,
        phone,
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
    if (data.phone !== undefined) {
      const phone = normalizeOptionalPhone(data.phone);
      if (phone) {
        const dup = await prisma.staff.findUnique({ where: { phone } });
        if (dup && dup.id !== id) {
          throw new ApiError(409, "Phone number already assigned to another staff member");
        }
      }
      updateData.phone = phone;
    }

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

/**
 * Store staff phones in the exact normalized form (05XXXXXXXX) that
 * resolveIdentity looks up on the WiFi portal. Storing the raw input
 * would silently break employee recognition. Invalid numbers are
 * rejected instead of being stored as dead weight.
 */
function normalizeOptionalPhone(phone: string | undefined | null): string | null {
  if (phone == null) return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  const normalized = normalizePhone(trimmed);
  if (!normalized) {
    throw new ApiError(400, "Invalid phone number — expected format 05XXXXXXXX");
  }
  return normalized;
}

export const staffService = new StaffService();
