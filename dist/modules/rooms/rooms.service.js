"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsService = void 0;
// src/modules/rooms/rooms.service.ts
const prisma_1 = require("../../lib/prisma");
class RoomsService {
    async create(data) {
        return prisma_1.prisma.room.create({ data });
    }
    async findAll() {
        return prisma_1.prisma.room.findMany();
    }
    async findOne(id) {
        return prisma_1.prisma.room.findUnique({ where: { id } });
    }
    async update(id, data) {
        return prisma_1.prisma.room.update({ where: { id }, data });
    }
    async delete(id) {
        return prisma_1.prisma.room.delete({ where: { id } });
    }
}
exports.RoomsService = RoomsService;
