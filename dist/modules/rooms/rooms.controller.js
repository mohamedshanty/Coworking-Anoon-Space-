"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsController = void 0;
const rooms_service_1 = require("./rooms.service");
const getParam_1 = require("../../lib/getParam");
const zod_1 = require("zod");
const roomSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
});
class RoomsController {
    static async create(req, res, next) {
        try {
            const parsed = roomSchema.parse(req.body);
            const room = await new rooms_service_1.RoomsService().create(parsed);
            res.status(201).json({ success: true, data: room });
        }
        catch (err) {
            next(err);
        }
    }
    static async getAll(req, res, next) {
        try {
            const rooms = await new rooms_service_1.RoomsService().findAll();
            res.json({ success: true, data: rooms });
        }
        catch (err) {
            next(err);
        }
    }
    static async getOne(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const room = await new rooms_service_1.RoomsService().findOne(id);
            if (!room)
                return res.status(404).json({ success: false, message: 'Room not found' });
            res.json({ success: true, data: room });
        }
        catch (err) {
            next(err);
        }
    }
    static async update(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const parsed = roomSchema.partial().parse(req.body);
            const room = await new rooms_service_1.RoomsService().update(id, parsed);
            res.json({ success: true, data: room });
        }
        catch (err) {
            next(err);
        }
    }
    static async delete(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            await new rooms_service_1.RoomsService().delete(id);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    }
}
exports.RoomsController = RoomsController;
