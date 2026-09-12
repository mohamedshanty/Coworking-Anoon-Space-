import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRosterFindMany,
  mockRosterFindUnique,
  mockRosterCreate,
  mockRosterUpdate,
  mockRosterDelete,
  mockAssertPhoneNotTaken,
} = vi.hoisted(() => ({
  mockRosterFindMany: vi.fn(),
  mockRosterFindUnique: vi.fn(),
  mockRosterCreate: vi.fn(),
  mockRosterUpdate: vi.fn(),
  mockRosterDelete: vi.fn(),
  mockAssertPhoneNotTaken: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    employeeRoster: {
      findMany: mockRosterFindMany,
      findUnique: mockRosterFindUnique,
      create: mockRosterCreate,
      update: mockRosterUpdate,
      delete: mockRosterDelete,
    },
  },
}));

vi.mock("../../lib/personUniqueness", () => ({
  assertPhoneNotTaken: mockAssertPhoneNotTaken,
}));

import { employeesService } from "./service";
import { ApiError } from "../../lib/ApiError";

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertPhoneNotTaken.mockImplementation((phone: string) =>
    Promise.resolve(phone.replace(/\D/g, "")),
  );
});

describe("employeesService", () => {
  it("list passes the active filter through", async () => {
    mockRosterFindMany.mockResolvedValue([]);
    await employeesService.listEmployees(true);
    expect(mockRosterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
    await employeesService.listEmployees(undefined);
    expect(mockRosterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("create checks uniqueness first, then stores the normalized phone", async () => {
    mockAssertPhoneNotTaken.mockResolvedValue("0590000000");
    mockRosterCreate.mockImplementation((args: any) =>
      Promise.resolve({ id: "e-1", ...args.data }),
    );

    const result = await employeesService.createEmployee({
      name: "  Test Employee  ",
      phone: "059-000-0000",
    });

    expect(mockAssertPhoneNotTaken).toHaveBeenCalledWith("059-000-0000");
    expect(mockRosterCreate).toHaveBeenCalledWith({
      data: { name: "Test Employee", phone: "0590000000" },
    });
    expect(result.phone).toBe("0590000000");
  });

  it("create surfaces the 409 from the uniqueness check", async () => {
    mockAssertPhoneNotTaken.mockRejectedValue(
      new ApiError(409, "This phone number is already registered as a subscriber"),
    );

    await expect(
      employeesService.createEmployee({ name: "Dup", phone: "0590000000" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockRosterCreate).not.toHaveBeenCalled();
  });

  it("update 404s on unknown id; patches name/active otherwise", async () => {
    mockRosterFindUnique.mockResolvedValue(null);
    await expect(
      employeesService.updateEmployee("missing", { active: false }),
    ).rejects.toMatchObject({ statusCode: 404 });

    mockRosterFindUnique.mockResolvedValue({ id: "e-1" });
    mockRosterUpdate.mockImplementation((args: any) =>
      Promise.resolve({ id: "e-1", ...args.data }),
    );
    await employeesService.updateEmployee("e-1", { active: false });
    expect(mockRosterUpdate).toHaveBeenCalledWith({
      where: { id: "e-1" },
      data: { active: false },
    });
  });

  it("delete 404s on unknown id; hard-deletes otherwise", async () => {
    mockRosterFindUnique.mockResolvedValue(null);
    await expect(employeesService.deleteEmployee("missing")).rejects.toMatchObject({
      statusCode: 404,
    });

    mockRosterFindUnique.mockResolvedValue({ id: "e-1" });
    mockRosterDelete.mockResolvedValue({ id: "e-1" });
    await employeesService.deleteEmployee("e-1");
    expect(mockRosterDelete).toHaveBeenCalledWith({ where: { id: "e-1" } });
  });
});
