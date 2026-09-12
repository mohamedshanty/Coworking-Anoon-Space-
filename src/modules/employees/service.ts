import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { assertPhoneNotTaken } from "../../lib/personUniqueness";
import { CreateEmployeeInput, UpdateEmployeeInput } from "./schema";

/**
 * Space-employee roster (name + phone only, no login).
 * Separate from Staff (admin login accounts) by design.
 */
export class EmployeesService {
  async listEmployees(active?: boolean) {
    return prisma.employeeRoster.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { createdAt: "desc" },
    });
  }

  async createEmployee(data: CreateEmployeeInput) {
    // Full cross-table check: a phone belongs to exactly one of
    // subscriber / trainee / employee.
    const phone = await assertPhoneNotTaken(data.phone);
    return prisma.employeeRoster.create({
      data: { name: data.name.trim(), phone },
    });
  }

  async updateEmployee(id: string, data: UpdateEmployeeInput) {
    const existing = await prisma.employeeRoster.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Employee not found");
    }
    return prisma.employeeRoster.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
  }

  async deleteEmployee(id: string) {
    const existing = await prisma.employeeRoster.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Employee not found");
    }
    // Hard delete: a roster entry has no FK dependents (sessions anchor on
    // Visitor rows, employees never sync to Anoon QR), so there is no
    // history to preserve — unlike subscribers (Task 5).
    return prisma.employeeRoster.delete({ where: { id } });
  }
}

export const employeesService = new EmployeesService();
