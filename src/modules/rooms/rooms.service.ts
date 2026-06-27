// src/modules/rooms/rooms.service.ts
import { prisma } from '../../lib/prisma';
import { Prisma, Room } from '@prisma/client';

export class RoomsService {
  async create(data: Prisma.RoomCreateInput): Promise<Room> {
    return prisma.room.create({ data });
  }

  async findAll(): Promise<Room[]> {
    return prisma.room.findMany();
  }

  async findOne(id: string): Promise<Room | null> {
    return prisma.room.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.RoomUpdateInput): Promise<Room> {
    return prisma.room.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Room> {
    return prisma.room.delete({ where: { id } });
  }
}
