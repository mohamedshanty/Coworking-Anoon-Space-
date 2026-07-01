"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followUpController = exports.FollowUpController = void 0;
const zod_1 = require("zod");
const service_1 = require("./service");
const getParam_1 = require("../../lib/getParam");
const followUpQuerySchema = zod_1.z.object({
    showAll: zod_1.z.enum(["true", "false"]).optional(),
});
class FollowUpController {
    async getFollowUpList(req, res, next) {
        try {
            const parsed = followUpQuerySchema.parse(req.query);
            const showAll = parsed.showAll === "true";
            const data = await service_1.followUpService.getFollowUpList(showAll);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async markContacted(req, res, next) {
        try {
            const visitorId = (0, getParam_1.getParam)(req.params.visitorId, 'visitorId');
            const data = await service_1.followUpService.markContacted(visitorId);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async optOut(req, res, next) {
        try {
            const visitorId = (0, getParam_1.getParam)(req.params.visitorId, 'visitorId');
            const data = await service_1.followUpService.optOut(visitorId);
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
exports.FollowUpController = FollowUpController;
exports.followUpController = new FollowUpController();
