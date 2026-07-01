"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = exports.DashboardController = void 0;
const zod_1 = require("zod");
const service_1 = require("./service");
const revenueTrendQuerySchema = zod_1.z.object({
    days: zod_1.z.coerce.number().int().min(1).max(365).optional().default(7),
});
class DashboardController {
    async getSummary(req, res, next) {
        try {
            const data = await service_1.dashboardService.getSummary();
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async getRevenueTrend(req, res, next) {
        try {
            const parsed = revenueTrendQuerySchema.parse(req.query);
            const data = await service_1.dashboardService.getRevenueTrend(parsed.days);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.DashboardController = DashboardController;
exports.dashboardController = new DashboardController();
