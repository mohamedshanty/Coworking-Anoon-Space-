"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesController = exports.ExpensesController = void 0;
const service_1 = require("./service");
const getParam_1 = require("../../lib/getParam");
const schema_1 = require("./schema");
class ExpensesController {
    async getExpenses(req, res, next) {
        try {
            const data = await service_1.expensesService.getExpenses();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createExpense(req, res, next) {
        try {
            const input = schema_1.createExpenseSchema.parse(req.body);
            const data = await service_1.expensesService.createExpense(input);
            res.status(201).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async editExpense(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const input = schema_1.updateExpenseSchema.parse(req.body);
            const data = await service_1.expensesService.editExpense(id, input);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteExpense(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const data = await service_1.expensesService.deleteExpense(id);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getExpensesByCategory(req, res, next) {
        try {
            // Validate query params if they exist
            const query = schema_1.byCategoryQuerySchema.parse(req.query);
            const data = await service_1.expensesService.getExpensesByCategory(query.from, query.to);
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
exports.ExpensesController = ExpensesController;
exports.expensesController = new ExpensesController();
