"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsService = void 0;
// src/modules/rooms/bookings.service.ts
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
// Using Prisma.Decimal for rounding, no extra import needed
class BookingsService {
    // Helper to round Decimal to 2 places
    round(value) {
        return new client_1.Prisma.Decimal(value).toFixed(2);
    }
    async create(data) {
        // If status is confirmed, check for conflict
        const roomId = data.room?.connect?.id;
        if (data.status === 'confirmed' && roomId) {
            const conflict = await this.findConflict(roomId, data.startTime, data.endTime);
            if (conflict) {
                throw new Error('Conflict');
            }
        }
        // Round price
        if (data.price) {
            data.price = this.round(data.price);
        }
        return prisma_1.prisma.booking.create({ data });
    }
    async findAll() {
        return prisma_1.prisma.booking.findMany();
    }
    async findOne(id) {
        return prisma_1.prisma.booking.findUnique({ where: { id } });
    }
    async update(id, data) {
        // If status changes to confirmed or times change, check conflict excluding this id
        const existing = await this.findOne(id);
        if (!existing)
            throw new Error('NotFound');
        const newStatus = data.status ?? existing.status;
        const newStart = data.startTime ?? existing.startTime;
        const newEnd = data.endTime ?? existing.endTime;
        if (newStatus === 'confirmed') {
            const conflict = await this.findConflict(existing.roomId, newStart, newEnd, id);
            if (conflict)
                throw new Error('Conflict');
        }
        if (data.price) {
            data.price = this.round(data.price);
        }
        return prisma_1.prisma.booking.update({ where: { id }, data });
    }
    async delete(id) {
        return prisma_1.prisma.booking.delete({ where: { id } });
    }
    // Conflict detection – returns conflicting booking or null
    async findConflict(roomId, start, end, excludeId) {
        return prisma_1.prisma.booking.findFirst({
            where: {
                roomId,
                status: 'confirmed',
                NOT: excludeId ? { id: excludeId } : undefined,
                AND: [
                    { startTime: { lt: end } },
                    { endTime: { gt: start } },
                ],
            },
        });
    }
}
exports.BookingsService = BookingsService;
