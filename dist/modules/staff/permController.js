"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsController = exports.PermissionsController = void 0;
const permService_1 = require("./permService");
const getParam_1 = require("../../lib/getParam");
const permSchema_1 = require("./permSchema");
class PermissionsController {
    async getMatrix(req, res, next) {
        try {
            const data = await permService_1.permissionsService.getMatrix((0, getParam_1.getParam)(req.params.staffId, 'staffId'));
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async updateMatrix(req, res, next) {
        try {
            const input = permSchema_1.updatePermissionsSchema.parse(req.body);
            const data = await permService_1.permissionsService.updateMatrix((0, getParam_1.getParam)(req.params.staffId, 'staffId'), input);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.PermissionsController = PermissionsController;
exports.permissionsController = new PermissionsController();
