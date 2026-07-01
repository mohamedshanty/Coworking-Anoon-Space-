"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesController = exports.SalesController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class SalesController {
    async getSnackSales(req, res, next) {
        try {
            const data = await service_1.salesService.getSnackSales();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getHotDrinkSales(req, res, next) {
        try {
            const data = await service_1.salesService.getHotDrinkSales();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createSnackSale(req, res, next) {
        try {
            const input = schema_1.createSnackSaleSchema.parse(req.body);
            const data = await service_1.salesService.createSnackSale(input);
            res.status(201).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createHotDrinkSale(req, res, next) {
        try {
            const input = schema_1.createHotDrinkSaleSchema.parse(req.body);
            const data = await service_1.salesService.createHotDrinkSale(input);
            res.status(201).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SalesController = SalesController;
exports.salesController = new SalesController();
