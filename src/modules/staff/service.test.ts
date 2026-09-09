import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockStaffFindUnique, mockStaffCreate, mockStaffUpdate } = vi.hoisted(() => ({
  mockStaffFindUnique: vi.fn(),
  mockStaffCreate: vi.fn(),
  mockStaffUpdate: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    staff: {
      findUnique: mockStaffFindUnique,
      create: mockStaffCreate,
      update: mockStaffUpdate,
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed") },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { staffService } from "./service";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE = {
  name: "Ahmad",
  username: "ahmad",
  role: "staff" as const,
  password: "secret123",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStaffFindUnique.mockResolvedValue(null);
  mockStaffCreate.mockImplementation(async ({ data }: any) => data);
  mockStaffUpdate.mockImplementation(async ({ data }: any) => data);
});

describe("staffService phone handling", () => {
  it("stores the phone normalized to 05XXXXXXXX (matches WiFi identity lookup)", async () => {
    await staffService.create({ ...BASE, phone: "+970599123456" });

    expect(mockStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: "0599123456" }),
      }),
    );
  });

  it("accepts 9-digit form and normalizes it", async () => {
    await staffService.create({ ...BASE, phone: "599123456" });

    expect(mockStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: "0599123456" }),
      }),
    );
  });

  it("stores null when phone is empty/omitted (no WiFi access)", async () => {
    await staffService.create({ ...BASE, phone: "" });
    await staffService.create({ ...BASE });

    expect(mockStaffCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ phone: null }) }),
    );
    expect(mockStaffCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ phone: null }) }),
    );
  });

  it("rejects invalid phone format with 400 instead of storing an unmatchable value", async () => {
    await expect(staffService.create({ ...BASE, phone: "123" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockStaffCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate phone with 409 on create", async () => {
    mockStaffFindUnique.mockImplementation(async ({ where }: any) =>
      where.phone === "0599123456" ? { id: "other-staff" } : null,
    );

    await expect(staffService.create({ ...BASE, phone: "0599123456" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockStaffCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate phone with 409 on update (different staff member)", async () => {
    mockStaffFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "me") return { id: "me", username: "ahmad" };
      if (where.phone === "0599123456") return { id: "other-staff" };
      return null;
    });

    await expect(
      staffService.update("me", { phone: "0599123456" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockStaffUpdate).not.toHaveBeenCalled();
  });

  it("allows keeping the same phone on update (same staff member)", async () => {
    mockStaffFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "me") return { id: "me", username: "ahmad" };
      if (where.phone === "0599123456") return { id: "me" };
      return null;
    });

    await staffService.update("me", { phone: "0599123456" });

    expect(mockStaffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: "0599123456" }),
      }),
    );
  });

  it("clears the phone when an empty string is sent on update", async () => {
    mockStaffFindUnique.mockImplementation(async ({ where }: any) =>
      where.id === "me" ? { id: "me", username: "ahmad" } : null,
    );

    await staffService.update("me", { phone: "" });

    expect(mockStaffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: null }),
      }),
    );
  });
});
