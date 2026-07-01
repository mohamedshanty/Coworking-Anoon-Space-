"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesService = void 0;
// src/modules/courses/courses.service.ts
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
const client_1 = require("@prisma/client");
class CoursesService {
    async create(data) {
        // Round pricePerTrainee
        if (data.pricePerTrainee) {
            data.pricePerTrainee = new client_1.Prisma.Decimal(data.pricePerTrainee).toFixed(2);
        }
        return prisma_1.prisma.course.create({ data });
    }
    async findAll() {
        return prisma_1.prisma.course.findMany();
    }
    async findOne(id) {
        return prisma_1.prisma.course.findUnique({ where: { id } });
    }
    async update(id, data) {
        if (data.pricePerTrainee) {
            data.pricePerTrainee = new client_1.Prisma.Decimal(data.pricePerTrainee).toFixed(2);
        }
        return prisma_1.prisma.course.update({ where: { id }, data });
    }
    async delete(id) {
        const course = await prisma_1.prisma.course.findUnique({ where: { id }, include: { _count: { select: { trainees: true } } } });
        if (!course)
            throw new ApiError_1.ApiError(404, "Course not found");
        if (course._count.trainees > 0) {
            throw new ApiError_1.ApiError(409, `Course has ${course._count.trainees} enrolled trainee(s). Remove or transfer them before deleting.`);
        }
        return prisma_1.prisma.course.delete({ where: { id } });
    }
    // Trainee operations
    async addTrainee(courseId, data) {
        if (data.amountPaid) {
            data.amountPaid = new client_1.Prisma.Decimal(data.amountPaid).toFixed(2);
        }
        return prisma_1.prisma.trainee.create({ data: { ...data, course: { connect: { id: courseId } } } });
    }
    async recordPayment(courseId, traineeId, amount) {
        if (amount <= 0) {
            throw new ApiError_1.ApiError(400, "Payment amount must be greater than zero");
        }
        const trainee = await prisma_1.prisma.trainee.findUnique({ where: { id: traineeId } });
        if (!trainee)
            throw new ApiError_1.ApiError(404, "Trainee not found");
        if (trainee.courseId !== courseId)
            throw new ApiError_1.ApiError(400, "Trainee does not belong to this course");
        const course = await prisma_1.prisma.course.findUnique({ where: { id: courseId } });
        if (!course)
            throw new ApiError_1.ApiError(404, "Course not found");
        const currentPaid = Number(trainee.amountPaid);
        const total = Number(course.pricePerTrainee);
        const newPaid = Math.round((currentPaid + amount + Number.EPSILON) * 100) / 100;
        if (newPaid > total) {
            throw new ApiError_1.ApiError(400, `Payment would exceed course price. Current: ${currentPaid}, Trying to pay: ${amount}, Course price: ${total}`);
        }
        const paymentStatus = newPaid >= total ? "full" : trainee.paymentStatus;
        return prisma_1.prisma.trainee.update({
            where: { id: traineeId },
            data: {
                amountPaid: new client_1.Prisma.Decimal(newPaid).toFixed(2),
                paymentStatus: paymentStatus,
            },
        });
    }
    async updateAttendance(courseId, traineeId, attendancePercent) {
        return prisma_1.prisma.trainee.update({
            where: { id: traineeId },
            data: { attendancePercent },
        });
    }
    async getTrainees(courseId) {
        return prisma_1.prisma.trainee.findMany({ where: { courseId } });
    }
    async updateTrainee(courseId, traineeId, data) {
        const trainee = await prisma_1.prisma.trainee.findUnique({ where: { id: traineeId } });
        if (!trainee)
            throw new ApiError_1.ApiError(404, "Trainee not found");
        if (trainee.courseId !== courseId)
            throw new ApiError_1.ApiError(404, "Trainee not found in this course");
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.phone !== undefined)
            updateData.phone = data.phone;
        if (data.paymentStatus !== undefined)
            updateData.paymentStatus = data.paymentStatus;
        return prisma_1.prisma.trainee.update({ where: { id: traineeId }, data: updateData });
    }
    async deleteTrainee(courseId, traineeId) {
        const trainee = await prisma_1.prisma.trainee.findUnique({ where: { id: traineeId } });
        if (!trainee)
            throw new ApiError_1.ApiError(404, "Trainee not found");
        if (trainee.courseId !== courseId)
            throw new ApiError_1.ApiError(404, "Trainee not found in this course");
        return prisma_1.prisma.trainee.delete({ where: { id: traineeId } });
    }
}
exports.CoursesService = CoursesService;
