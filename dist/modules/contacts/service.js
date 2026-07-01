"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactsService = exports.ContactsService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("00970"))
        return "0" + digits.slice(4);
    if (digits.startsWith("970"))
        return "0" + digits.slice(3);
    if (digits.startsWith("+970"))
        return "0" + digits.slice(4);
    if (!digits.startsWith("0") && digits.length === 9)
        return "0" + digits;
    return digits;
}
function normalizeName(name) {
    return name.replace(/\s+/g, " ").trim();
}
class ContactsService {
    async list(search) {
        const where = search
            ? {
                OR: [
                    { fullName: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                ],
            }
            : {};
        return prisma_1.prisma.contact.findMany({
            where,
            orderBy: { fullName: "asc" },
        });
    }
    async search(query) {
        const trimmed = query.trim();
        if (trimmed.length < 1)
            return [];
        return prisma_1.prisma.contact.findMany({
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
    async getById(id) {
        const contact = await prisma_1.prisma.contact.findUnique({ where: { id } });
        if (!contact)
            throw new ApiError_1.ApiError(404, "جهة الاتصال غير موجودة");
        return contact;
    }
    async create(data) {
        const normalizedPhone = normalizePhone(data.phone);
        const normalizedName = normalizeName(data.fullName);
        const existing = await prisma_1.prisma.contact.findUnique({
            where: { phone: normalizedPhone },
        });
        if (existing) {
            throw new ApiError_1.ApiError(409, "رقم الجوال مسجل مسبقاً");
        }
        return prisma_1.prisma.contact.create({
            data: {
                fullName: normalizedName,
                phone: normalizedPhone,
                notes: data.notes,
            },
        });
    }
    async update(id, data) {
        const contact = await prisma_1.prisma.contact.findUnique({ where: { id } });
        if (!contact)
            throw new ApiError_1.ApiError(404, "جهة الاتصال غير موجودة");
        if (data.phone) {
            const normalizedPhone = normalizePhone(data.phone);
            const existing = await prisma_1.prisma.contact.findUnique({
                where: { phone: normalizedPhone },
            });
            if (existing && existing.id !== id) {
                throw new ApiError_1.ApiError(409, "رقم الجوال مسجل مسبقاً لجهة اتصال أخرى");
            }
            data.phone = normalizedPhone;
        }
        if (data.fullName) {
            data.fullName = normalizeName(data.fullName);
        }
        return prisma_1.prisma.contact.update({
            where: { id },
            data,
        });
    }
    async delete(id) {
        const contact = await prisma_1.prisma.contact.findUnique({ where: { id } });
        if (!contact)
            throw new ApiError_1.ApiError(404, "جهة الاتصال غير موجودة");
        return prisma_1.prisma.contact.delete({ where: { id } });
    }
    async import(contacts) {
        let added = 0;
        let skipped = 0;
        let updated = 0;
        const conflicts = [];
        const errors = [];
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
            const existingByPhone = await prisma_1.prisma.contact.findUnique({
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
            const existingByName = await prisma_1.prisma.contact.findFirst({
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
                await prisma_1.prisma.contact.create({
                    data: {
                        fullName: normalizedName,
                        phone: normalizedPhone,
                    },
                });
                added++;
            }
            catch {
                errors.push({ row: i + 1, reason: "خطأ في إنشاء جهة الاتصال" });
                skipped++;
            }
        }
        return { added, updated, skipped, conflicts, errors };
    }
    async fuzzySearch(query) {
        const trimmed = query.trim();
        if (trimmed.length < 1)
            return [];
        // First try exact prefix match
        const exactMatches = await prisma_1.prisma.contact.findMany({
            where: {
                fullName: { startsWith: trimmed, mode: "insensitive" },
            },
            orderBy: { fullName: "asc" },
            take: 10,
        });
        if (exactMatches.length > 0)
            return exactMatches;
        // Then try contains match
        const containsMatches = await prisma_1.prisma.contact.findMany({
            where: {
                fullName: { contains: trimmed, mode: "insensitive" },
            },
            orderBy: { fullName: "asc" },
            take: 10,
        });
        return containsMatches;
    }
}
exports.ContactsService = ContactsService;
exports.contactsService = new ContactsService();
