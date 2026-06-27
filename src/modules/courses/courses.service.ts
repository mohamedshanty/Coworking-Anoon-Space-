// src/modules/courses/courses.service.ts
import { prisma } from '../../lib/prisma';
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
    return prisma.course.delete({ where: { id } });
  }

  // Trainee operations
  async addTrainee(courseId: string, data: Prisma.TraineeCreateInput): Promise<Trainee> {
    if (data.amountPaid) {
      (data as any).amountPaid = new Prisma.Decimal(data.amountPaid as any).toFixed(2);
    }
    return prisma.trainee.create({ data: { ...data, courseId } });
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
}
