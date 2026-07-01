import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateContactInput, UpdateContactInput, ImportContactInput } from "./schema";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00970")) return "0" + digits.slice(4);
  if (digits.startsWith("970")) return "0" + digits.slice(3);
  if (digits.startsWith("+970")) return "0" + digits.slice(4);
  if (!digits.startsWith("0") && digits.length === 9) return "0" + digits;
  return digits;
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export class ContactsService {
  async list(search?: string) {
    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    return prisma.contact.findMany({
      where,
      orderBy: { fullName: "asc" },
    });
  }

  async search(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];

    return prisma.contact.findMany({
      where: {
        OR: [
          { fullName: { contains: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      orderBy: { fullName: "asc" },
      take: 20,
    });
  }

  async getById(id: string) {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new ApiError(404, "جهة الاتصال غير موجودة");
    return contact;
  }

  async create(data: CreateContactInput) {
    const normalizedPhone = normalizePhone(data.phone);
    const normalizedName = normalizeName(data.fullName);

    const existing = await prisma.contact.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      throw new ApiError(409, "رقم الجوال مسجل مسبقاً");
    }

    return prisma.contact.create({
      data: {
        fullName: normalizedName,
        phone: normalizedPhone,
        notes: data.notes,
      },
    });
  }

  async update(id: string, data: UpdateContactInput) {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new ApiError(404, "جهة الاتصال غير موجودة");

    if (data.phone) {
      const normalizedPhone = normalizePhone(data.phone);
      const existing = await prisma.contact.findUnique({
        where: { phone: normalizedPhone },
      });
      if (existing && existing.id !== id) {
        throw new ApiError(409, "رقم الجوال مسجل مسبقاً لجهة اتصال أخرى");
      }
      data.phone = normalizedPhone;
    }

    if (data.fullName) {
      data.fullName = normalizeName(data.fullName);
    }

    return prisma.contact.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new ApiError(404, "جهة الاتصال غير موجودة");
    return prisma.contact.delete({ where: { id } });
  }

  async import(contacts: ImportContactInput[]) {
    let added = 0;
    let skipped = 0;
    let updated = 0;
    const conflicts: { fullName: string; existingPhone: string; newPhone: string }[] = [];
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const { fullName, phone } = contacts[i];
      const normalizedName = normalizeName(fullName);
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedName || !normalizedPhone) {
        errors.push({ row: i + 1, reason: "اسم أو رقم جوال فارغ" });
        skipped++;
        continue;
      }

      // Check if phone already exists
      const existingByPhone = await prisma.contact.findUnique({
        where: { phone: normalizedPhone },
      });

      if (existingByPhone) {
        // Same phone, different name → flag conflict
        if (existingByPhone.fullName !== normalizedName) {
          conflicts.push({
            fullName: normalizedName,
            existingPhone: existingByPhone.phone,
            newPhone: normalizedPhone,
          });
          skipped++;
          continue;
        }
        // Same phone, same name → skip (duplicate)
        skipped++;
        continue;
      }

      // Check if name exists with different phone
      const existingByName = await prisma.contact.findFirst({
        where: { fullName: normalizedName },
      });

      if (existingByName) {
        // Same name, different phone → flag conflict
        if (existingByName.phone !== normalizedPhone) {
          conflicts.push({
            fullName: normalizedName,
            existingPhone: existingByName.phone,
            newPhone: normalizedPhone,
          });
          skipped++;
          continue;
        }
        // Same name, same phone → skip (shouldn't reach here since phone check above)
        skipped++;
        continue;
      }

      // New contact
      try {
        await prisma.contact.create({
          data: {
            fullName: normalizedName,
            phone: normalizedPhone,
          },
        });
        added++;
      } catch {
        errors.push({ row: i + 1, reason: "خطأ في إنشاء جهة الاتصال" });
        skipped++;
      }
    }

    return { added, updated, skipped, conflicts, errors };
  }

  async fuzzySearch(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];

    // First try exact prefix match
    const exactMatches = await prisma.contact.findMany({
      where: {
        fullName: { startsWith: trimmed, mode: "insensitive" },
      },
      orderBy: { fullName: "asc" },
      take: 10,
    });

    if (exactMatches.length > 0) return exactMatches;

    // Then try contains match
    const containsMatches = await prisma.contact.findMany({
      where: {
        fullName: { contains: trimmed, mode: "insensitive" },
      },
      orderBy: { fullName: "asc" },
      take: 10,
    });

    return containsMatches;
  }
}

export const contactsService = new ContactsService();
