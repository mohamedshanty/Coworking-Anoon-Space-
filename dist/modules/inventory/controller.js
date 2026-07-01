"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryController = exports.InventoryController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class InventoryController {
    async getInventory(req, res, next) {
        try {
            const data = await service_1.inventoryService.getInventory();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createItem(req, res, next) {
        try {
            const input = schema_1.createInventoryItemSchema.parse(req.body);
            const data = await service_1.inventoryService.createItem(input);
            res.status(201).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async editItem(req, res, next) {
        try {
            const id = req.params.id;
            const input = schema_1.updateInventoryItemSchema.parse(req.body);
            const data = await service_1.inventoryService.editItem(id, input);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async restockItem(req, res, next) {
        try {
            const id = req.params.id;
            const { quantity } = schema_1.restockSchema.parse(req.body);
            const data = await service_1.inventoryService.restockItem(id, quantity);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteItem(req, res, next) {
        try {
            const id = req.params.id;
            const data = await service_1.inventoryService.deleteItem(id);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.InventoryController = InventoryController;
exports.inventoryController = new InventoryController();
