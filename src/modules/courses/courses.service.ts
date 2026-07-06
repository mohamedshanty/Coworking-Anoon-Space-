// src/modules/courses/courses.service.ts
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { Prisma, Course, Trainee } from '@prisma/client';

export class CoursesService {
  async create(data: Prisma.CourseCreateInput): Promise<Course> {
    // Round pricePerTrainee
    if (data.pricePerTrainee) {
      (data as any).pricePerTrainee = new Prisma.Decimal(data.pricePerTrainee as any).toFixed(2);
    }
    return prisma.course.create({ data });
  }

  async findAll(): Promise<Course[]> {
    return prisma.course.findMany();
  }

  async findOne(id: string): Promise<Course | null> {
    return prisma.course.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.CourseUpdateInput): Promise<Course> {
    if (data.pricePerTrainee) {
      (data as any).pricePerTrainee = new Prisma.Decimal(data.pricePerTrainee as any).toFixed(2);
    }
    return prisma.course.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Course> {
    const course = await prisma.course.findUnique({ where: { id }, include: { _count: { select: { trainees: true } } } });
    if (!course) throw new ApiError(404, "Course not found");
    if (course._count.trainees > 0) {
      throw new ApiError(409, `Course has ${course._count.trainees} enrolled trainee(s). Remove or transfer them before deleting.`);
    }
    return prisma.course.delete({ where: { id } });
  }

  // Trainee operations
  async addTrainee(courseId: string, data: Omit<Prisma.TraineeCreateInput, 'course'>): Promise<Trainee> {
    if (data.amountPaid) {
      (data as any).amountPaid = new Prisma.Decimal(data.amountPaid as any).toFixed(2);
    }
    return prisma.trainee.create({ data: { ...data, course: { connect: { id: courseId } } } });
  }

  async recordPayment(courseId: string, traineeId: string, amount: number): Promise<Trainee> {
    if (amount <= 0) {
      throw new ApiError(400, "Payment amount must be greater than zero");
    }

    const trainee = await prisma.trainee.findUnique({ where: { id: traineeId } });
    if (!trainee) throw new ApiError(404, "Trainee not found");
    if (trainee.courseId !== courseId) throw new ApiError(400, "Trainee does not belong to this course");

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ApiError(404, "Course not found");

    const currentPaid = Number(trainee.amountPaid);
    const total = Number(course.pricePerTrainee);
    const newPaid = Math.round((currentPaid + amount + Number.EPSILON) * 100) / 100;

    if (newPaid > total) {
      throw new ApiError(400, `Payment would exceed course price. Current: ${currentPaid}, Trying to pay: ${amount}, Course price: ${total}`);
    }

    const paymentStatus = newPaid >= total ? "full" : trainee.paymentStatus;

    return prisma.trainee.update({
      where: { id: traineeId },
      data: {
        amountPaid: new Prisma.Decimal(newPaid).toFixed(2) as any,
        paymentStatus: paymentStatus as any,
      },
    });
  }

  async updateAttendance(courseId: string, traineeId: string, attendancePercent: number): Promise<Trainee> {
    return prisma.trainee.update({
      where: { id: traineeId },
      data: { attendancePercent },
    });
  }

  async getTrainees(courseId: string): Promise<Trainee[]> {
    return prisma.trainee.findMany({ where: { courseId } });
  }

  async updateTrainee(courseId: string, traineeId: string, data: { name?: string; phone?: string; paymentStatus?: string; amountPaid?: number }): Promise<Trainee> {
    const trainee = await prisma.trainee.findUnique({ where: { id: traineeId } });
    if (!trainee) throw new ApiError(404, "Trainee not found");
    if (trainee.courseId !== courseId) throw new ApiError(404, "Trainee not found in this course");

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.paymentStatus !== undefined) updateData.paymentStatus = data.paymentStatus;
    if (data.amountPaid !== undefined) updateData.amountPaid = new Prisma.Decimal(data.amountPaid).toFixed(2);

    return prisma.trainee.update({ where: { id: traineeId }, data: updateData });
  }

  async deleteTrainee(courseId: string, traineeId: string): Promise<Trainee> {
    const trainee = await prisma.trainee.findUnique({ where: { id: traineeId } });
    if (!trainee) throw new ApiError(404, "Trainee not found");
    if (trainee.courseId !== courseId) throw new ApiError(404, "Trainee not found in this course");

    return prisma.trainee.delete({ where: { id: traineeId } });
  }
}
