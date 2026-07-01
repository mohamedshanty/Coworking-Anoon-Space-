"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionsController = exports.SessionsController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class SessionsController {
    async visitorLookup(req, res, next) {
        try {
            const q = req.query.q ?? "";
            const data = await service_1.sessionsService.visitorLookup(q);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getLiveSessions(req, res, next) {
        try {
            const data = await service_1.sessionsService.getLiveSessions();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async checkIn(req, res, next) {
        try {
            const input = schema_1.checkInSchema.parse(req.body);
            const session = await service_1.sessionsService.checkIn(input);
            // Socket broadcast
            const io = req.app.get("io");
            if (io) {
                io.emit("session:checked_in", session);
            }
            res.status(201).json({
                success: true,
                data: session,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async editSession(req, res, next) {
        try {
            const id = req.params.id;
            const input = schema_1.updateSessionSchema.parse(req.body);
            const session = await service_1.sessionsService.editSession(id, input);
            res.status(200).json({
                success: true,
                data: session,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async checkout(req, res, next) {
        try {
            const id = req.params.id;
            const { paymentMethod } = schema_1.checkoutSchema.parse(req.body);
            const session = await service_1.sessionsService.checkout(id, paymentMethod);
            // Socket broadcast
            const io = req.app.get("io");
            if (io) {
                io.emit("session:checked_out", session);
            }
            res.status(200).json({
                success: true,
                data: session,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async checkoutUnpaid(req, res, next) {
        try {
            const id = req.params.id;
            const session = await service_1.sessionsService.checkoutUnpaid(id);
            // Socket broadcast
            const io = req.app.get("io");
            if (io) {
                io.emit("session:checked_out", session);
            }
            res.status(200).json({
                success: true,
                data: session,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async addOrder(req, res, next) {
        try {
            const id = req.params.id;
            const { itemId, qty } = schema_1.addOrderSchema.parse(req.body);
            const { order, sale } = await service_1.sessionsService.addOrder(id, itemId, qty);
            // Socket broadcast
            const io = req.app.get("io");
            if (io) {
                io.emit("session:order_added", { sessionId: id, order, sale });
            }
            res.status(201).json({
                success: true,
                order,
                sale,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getHistory(req, res, next) {
        try {
            const { from, to, type, paymentStatus, page, limit } = req.query;
            if (!from || !to) {
                res.status(400).json({ success: false, message: "'from' and 'to' query params are required" });
                return;
            }
            const data = await service_1.sessionsService.getHistory({
                from: from,
                to: to,
                type: type,
                paymentStatus: paymentStatus,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async getHistorySummary(req, res, next) {
        try {
            const { from, to } = req.query;
            if (!from || !to) {
                res.status(400).json({ success: false, message: "'from' and 'to' query params are required" });
                return;
            }
            const data = await service_1.sessionsService.getHistorySummary({
                from: from,
                to: to,
            });
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SessionsController = SessionsController;
exports.sessionsController = new SessionsController();
