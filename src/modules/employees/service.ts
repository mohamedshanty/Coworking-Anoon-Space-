import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { assertPhoneNotTaken } from "../../lib/personUniqueness";
import { CreateEmployeeInput, UpdateEmployeeInput } from "./schema";
import { syncMemberToAnoonQr, deactivateMemberOnAnoonQr } from "../../lib/anoon-sync";

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
    const employee = await prisma.employeeRoster.create({
      data: { name: data.name.trim(), phone },
    });

    // Fire-and-forget: sync to Anoon QR
    void syncMemberToAnoonQr({
      name: data.name.trim(),
      phone,
      packageType: "monthly",
      startDate: new Date(),
      type: "employee",
    });

    return employee;
  }

  async updateEmployee(id: string, data: UpdateEmployeeInput) {
    const existing = await prisma.employeeRoster.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Employee not found");
    }
    const updated = await prisma.employeeRoster.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    // Fire-and-forget: sync name changes to Anoon QR
    if (data.name) {
      void syncMemberToAnoonQr({
        name: data.name.trim(),
        phone: updated.phone,
        packageType: "monthly",
        startDate: new Date(),
        type: "employee",
      });
    }

    return updated;
  }

  async deleteEmployee(id: string) {
    const existing = await prisma.employeeRoster.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Employee not found");
    }
    const deleted = await prisma.employeeRoster.delete({ where: { id } });

    // Fire-and-forget: deactivate on Anoon QR
    void deactivateMemberOnAnoonQr(deleted.phone);

    return deleted;
  }
}

export const employeesService = new EmployeesService();
