"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debtsController = exports.DebtsController = void 0;
const service_1 = require("./service");
const getParam_1 = require("../../lib/getParam");
const schema_1 = require("./schema");
class DebtsController {
    async getDebts(req, res, next) {
        try {
            const data = await service_1.debtsService.getDebts();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createDebt(req, res, next) {
        try {
            const input = schema_1.createDebtSchema.parse(req.body);
            const data = await service_1.debtsService.createDebt(input);
            res.status(201).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async editDebt(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const input = schema_1.updateDebtSchema.parse(req.body);
            const data = await service_1.debtsService.editDebt(id, input);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteDebt(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const data = await service_1.debtsService.deleteDebt(id);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async collectDebt(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const data = await service_1.debtsService.collectDebt(id);
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
exports.DebtsController = DebtsController;
exports.debtsController = new DebtsController();
