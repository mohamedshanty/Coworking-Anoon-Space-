"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = exports.SettingsController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class SettingsController {
    async getSettings(req, res, next) {
        try {
            const data = await service_1.settingsService.getSettings();
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async updateSettings(req, res, next) {
        try {
            const input = schema_1.updateSettingsSchema.parse(req.body);
            const data = await service_1.settingsService.updateSettings(input);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SettingsController = SettingsController;
exports.settingsController = new SettingsController();
