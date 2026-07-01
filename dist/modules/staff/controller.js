"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffController = exports.StaffController = void 0;
const service_1 = require("./service");
const getParam_1 = require("../../lib/getParam");
const schema_1 = require("./schema");
class StaffController {
    async getAll(req, res, next) {
        try {
            const data = await service_1.staffService.getAll();
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const data = await service_1.staffService.getById((0, getParam_1.getParam)(req.params.id));
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const input = schema_1.createStaffSchema.parse(req.body);
            const data = await service_1.staffService.create(input);
            res.status(201).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const input = schema_1.updateStaffSchema.parse(req.body);
            const data = await service_1.staffService.update((0, getParam_1.getParam)(req.params.id), input);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const data = await service_1.staffService.delete((0, getParam_1.getParam)(req.params.id));
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.StaffController = StaffController;
exports.staffController = new StaffController();
