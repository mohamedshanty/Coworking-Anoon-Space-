"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesController = void 0;
const courses_service_1 = require("./courses.service");
const getParam_1 = require("../../lib/getParam");
const zod_1 = require("zod");
const courseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    trainer: zod_1.z.string().min(1),
    startDate: zod_1.z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid startDate' }),
    endDate: zod_1.z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid endDate' }),
    sessionsCount: zod_1.z.number().int().min(1),
    pricePerTrainee: zod_1.z.number(),
    maxSeats: zod_1.z.number().int().min(1),
    roomId: zod_1.z.string(),
});
const traineeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().min(1),
    amountPaid: zod_1.z.number(),
    paymentStatus: zod_1.z.enum(['full', 'installment']),
    attendancePercent: zod_1.z.number().min(0).max(100),
});
class CoursesController {
    static async create(req, res, next) {
        try {
            const parsed = courseSchema.parse(req.body);
            const { roomId, ...rest } = parsed;
            const course = await new courses_service_1.CoursesService().create({
                ...rest,
                startDate: new Date(parsed.startDate),
                endDate: new Date(parsed.endDate),
                room: { connect: { id: roomId } },
            });
            res.status(201).json({ success: true, data: course });
        }
        catch (err) {
            next(err);
        }
    }
    static async getAll(req, res, next) {
        try {
            const courses = await new courses_service_1.CoursesService().findAll();
            res.json({ success: true, data: courses });
        }
        catch (err) {
            next(err);
        }
    }
    static async getOne(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const course = await new courses_service_1.CoursesService().findOne(id);
            if (!course)
                return res.status(404).json({ success: false, message: 'Course not found' });
            res.json({ success: true, data: course });
        }
        catch (err) {
            next(err);
        }
    }
    static async update(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const parsed = courseSchema.partial().parse(req.body);
            const course = await new courses_service_1.CoursesService().update(id, {
                ...parsed,
                ...(parsed.startDate ? { startDate: new Date(parsed.startDate) } : {}),
                ...(parsed.endDate ? { endDate: new Date(parsed.endDate) } : {}),
            });
            res.json({ success: true, data: course });
        }
        catch (err) {
            next(err);
        }
    }
    static async delete(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            await new courses_service_1.CoursesService().delete(id);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    }
    // Trainees endpoints
    static async getTrainees(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id); // course id
            const trainees = await new courses_service_1.CoursesService().getTrainees(id);
            res.json({ success: true, data: trainees });
        }
        catch (err) {
            next(err);
        }
    }
    static async addTrainee(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id); // course id
            const parsed = traineeSchema.parse(req.body);
            const trainee = await new courses_service_1.CoursesService().addTrainee(id, parsed);
            res.status(201).json({ success: true, data: trainee });
        }
        catch (err) {
            next(err);
        }
    }
    static async recordPayment(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const traineeId = (0, getParam_1.getParam)(req.params.traineeId, 'traineeId');
            const paymentSchema = zod_1.z.object({
                amount: zod_1.z.number().positive("Amount must be positive"),
            });
            const { amount } = paymentSchema.parse(req.body);
            const trainee = await new courses_service_1.CoursesService().recordPayment(id, traineeId, amount);
            res.json({ success: true, data: trainee });
        }
        catch (err) {
            next(err);
        }
    }
    static async updateAttendance(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const traineeId = (0, getParam_1.getParam)(req.params.traineeId, 'traineeId');
            const attendanceSchema = zod_1.z.object({
                attendancePercent: zod_1.z.number().min(0).max(100),
            });
            const { attendancePercent } = attendanceSchema.parse(req.body);
            const trainee = await new courses_service_1.CoursesService().updateAttendance(id, traineeId, attendancePercent);
            res.json({ success: true, data: trainee });
        }
        catch (err) {
            next(err);
        }
    }
    static async updateTrainee(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const traineeId = (0, getParam_1.getParam)(req.params.traineeId, 'traineeId');
            const schema = zod_1.z.object({
                name: zod_1.z.string().min(1).optional(),
                phone: zod_1.z.string().min(1).optional(),
                paymentStatus: zod_1.z.enum(["full", "installment"]).optional(),
            });
            const parsed = schema.parse(req.body);
            const trainee = await new courses_service_1.CoursesService().updateTrainee(id, traineeId, parsed);
            res.json({ success: true, data: trainee });
        }
        catch (err) {
            next(err);
        }
    }
    static async deleteTrainee(req, res, next) {
        try {
            const id = (0, getParam_1.getParam)(req.params.id);
            const traineeId = (0, getParam_1.getParam)(req.params.traineeId, 'traineeId');
            await new courses_service_1.CoursesService().deleteTrainee(id, traineeId);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    }
}
exports.CoursesController = CoursesController;
