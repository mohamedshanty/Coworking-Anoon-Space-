"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = exports.InventoryService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
class InventoryService {
    async getInventory() {
        return prisma_1.prisma.inventoryItem.findMany({
            orderBy: { name: "asc" },
        });
    }
    async createItem(data) {
        const roundedCost = Math.round((data.costPrice + Number.EPSILON) * 100) / 100;
        const roundedSell = Math.round((data.sellPrice + Number.EPSILON) * 100) / 100;
        return prisma_1.prisma.inventoryItem.create({
            data: {
                name: data.name,
                quantity: data.quantity,
                costPrice: roundedCost,
                sellPrice: roundedSell,
                alertThreshold: data.alertThreshold,
                lastRestockDate: new Date(),
            },
        });
    }
    async editItem(id, data) {
        const item = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new ApiError_1.ApiError(404, "Inventory item not found");
        }
        const roundedCost = data.costPrice !== undefined
            ? Math.round((data.costPrice + Number.EPSILON) * 100) / 100
            : undefined;
        const roundedSell = data.sellPrice !== undefined
            ? Math.round((data.sellPrice + Number.EPSILON) * 100) / 100
            : undefined;
        return prisma_1.prisma.inventoryItem.update({
            where: { id },
            data: {
                ...(data.name ? { name: data.name } : {}),
                ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
                ...(roundedCost !== undefined ? { costPrice: roundedCost } : {}),
                ...(roundedSell !== undefined ? { sellPrice: roundedSell } : {}),
                ...(data.alertThreshold !== undefined ? { alertThreshold: data.alertThreshold } : {}),
            },
        });
    }
    async restockItem(id, quantity) {
        const item = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new ApiError_1.ApiError(404, "Inventory item not found");
        }
        return prisma_1.prisma.inventoryItem.update({
            where: { id },
            data: {
                quantity: item.quantity + quantity,
                lastRestockDate: new Date(),
            },
        });
    }
    async deleteItem(id) {
        const item = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new ApiError_1.ApiError(404, "Inventory item not found");
        }
        return prisma_1.prisma.inventoryItem.delete({
            where: { id },
        });
    }
}
exports.InventoryService = InventoryService;
exports.inventoryService = new InventoryService();
