"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsController = void 0;
const bookings_service_1 = require("./bookings.service");
const getParam_1 = require("../../lib/getParam");
const zod_1 = require("zod");
const bookingSchema = zod_1.z.object({
    roomId: zod_1.z.string(),
    bookerName: zod_1.z.string().min(1),
    bookerPhone: zod_1.z.string().min(1),
    purpose: zod_1.z.string().min(1),
    startTime: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid startTime' }),
    endTime: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid endTime' }),
    price: zod_1.z.number(),
    status: zod_1.z.enum(['confirmed', 'pending', 'cancelled']),
});
class BookingsController {
    static async create(req, res, next) {
        try {
            const parsed = bookingSchema.parse(req.body);
            const { roomId, ...rest } = parsed;
            const booking = await new bookings_service_1.BookingsService().create({
                ...rest,
                startTime: new Date(parsed.startTime),
                endTime: new Date(parsed.endTime),
                room: { connect: { id: roomId } },
            });
            res.status(201).json({ success: true, data: booking });
        }
        catch (err) {
            if (err instanceof Error && err.message === 'Conflict') {
                return res.status(409).json({ success: false, message: 'Booking time conflict' });
            }
            next(err);
        }
    }
    static async getAll(req, res, next) {
        try {
            const bookings = await new bookings_service_1.BookingsService().findAll();
            res.json({ success: true, data: bookings });
        }
        catch (err) {
            next(err);
        }
    }
    static async getOne(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const booking = await new bookings_service_1.BookingsService().findOne(id);
            if (!booking)
                return res.status(404).json({ success: false, message: 'Booking not found' });
            res.json({ success: true, data: booking });
        }
        catch (err) {
            next(err);
        }
    }
    static async update(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const parsed = bookingSchema.partial().parse(req.body);
            const booking = await new bookings_service_1.BookingsService().update(id, {
                ...parsed,
                ...(parsed.startTime ? { startTime: new Date(parsed.startTime) } : {}),
                ...(parsed.endTime ? { endTime: new Date(parsed.endTime) } : {}),
            });
            res.json({ success: true, data: booking });
        }
        catch (err) {
            if (err instanceof Error && err.message === 'Conflict') {
                return res.status(409).json({ success: false, message: 'Booking time conflict' });
            }
            next(err);
        }
    }
    static async delete(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            await new bookings_service_1.BookingsService().delete(id);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    }
    static async checkConflict(req, res, next) {
        try {
            const conflictQuerySchema = zod_1.z.object({
                roomId: zod_1.z.string().min(1),
                start: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid start" }),
                end: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid end" }),
                excludeId: zod_1.z.string().optional(),
            });
            const parsed = conflictQuerySchema.parse(req.query);
            const conflict = await new bookings_service_1.BookingsService().findConflict(parsed.roomId, new Date(parsed.start), new Date(parsed.end), parsed.excludeId);
            if (conflict) {
                return res.json({ success: true, conflict });
            }
            res.json({ success: true, conflict: null });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.BookingsController = BookingsController;
