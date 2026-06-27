// src/modules/rooms/bookings.service.ts
import { prisma } from '../../lib/prisma';
import { Prisma, Booking, BookingStatus } from '@prisma/client';
// Using Prisma.Decimal for rounding, no extra import needed

export class BookingsService {
  // Helper to round Decimal to 2 places
  private round(value: number | string): Prisma.Decimal {
    return new Prisma.Decimal(value).toFixed(2);
  }

  async create(data: Prisma.BookingCreateInput): Promise<Booking> {
    // If status is confirmed, check for conflict
    if ((data.status as any) === 'confirmed') {
      const conflict = await this.findConflict(data.roomId as string, data.startTime as Date, data.endTime as Date);
      if (conflict) {
        throw new Error('Conflict');
      }
    }
    // Round price
    if (data.price) {
      (data as any).price = this.round(data.price as any);
    }
    return prisma.booking.create({ data });
  }

  async findAll(): Promise<Booking[]> {
    return prisma.booking.findMany();
  }

  async findOne(id: string): Promise<Booking | null> {
    return prisma.booking.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.BookingUpdateInput): Promise<Booking> {
    // If status changes to confirmed or times change, check conflict excluding this id
    const existing = await this.findOne(id);
    if (!existing) throw new Error('NotFound');
    const newStatus = data.status ?? existing.status;
    const newStart = data.startTime ?? existing.startTime;
    const newEnd = data.endTime ?? existing.endTime;
    if (newStatus === 'confirmed') {
      const conflict = await this.findConflict(existing.roomId, newStart as Date, newEnd as Date, id);
      if (conflict) throw new Error('Conflict');
    }
    if (data.price) {
      (data as any).price = this.round(data.price as any);
    }
    return prisma.booking.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Booking> {
    return prisma.booking.delete({ where: { id } });
  }

  // Conflict detection – returns conflicting booking or null
  async findConflict(roomId: string, start: Date, end: Date, excludeId?: string): Promise<Booking | null> {
    return prisma.booking.findFirst({
      where: {
        roomId,
        status: 'confirmed' as BookingStatus,
        NOT: excludeId ? { id: excludeId } : undefined,
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });
  }
}
