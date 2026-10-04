import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVisitorFindUnique,
  mockVisitorFindFirst,
  mockSessionFindFirst,
  mockSubFindFirst,
  mockSubUpdateMany,
  mockSubCreate,
  mockDebtCreate,
  mockAuditCreate,
  mockTx,
  mockTransaction,
  mockRosterFindUnique,
} = vi.hoisted(() => ({
  mockVisitorFindUnique: vi.fn(),
  mockVisitorFindFirst: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSubFindFirst: vi.fn(),
  mockSubUpdateMany: vi.fn(),
  mockSubCreate: vi.fn(),
  mockDebtCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTx: null as any,
  mockTransaction: vi.fn(),
  mockRosterFindUnique: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: { findUnique: mockVisitorFindUnique, findFirst: mockVisitorFindFirst },
    session: { findFirst: mockSessionFindFirst },
    subscription: {
      findFirst: mockSubFindFirst,
      updateMany: mockSubUpdateMany,
      create: mockSubCreate,
    },
    debt: { create: mockDebtCreate },
    personAudit: { create: mockAuditCreate },
    employeeRoster: { findUnique: mockRosterFindUnique },
    snackWallet: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock("../../lib/anoon-sync", () => ({
  syncMemberToAnoonQr: vi.fn(),
  deactivateMemberOnAnoonQr: vi.fn(),
}));

import { visitorsService } from "./service";

const BASE = { id: "v-1", name: "Test Person", phone: "0590000001", deletedAt: null };

function txMocks() {
  const tx = {
    subscription: { updateMany: mockSubUpdateMany, create: mockSubCreate },
    visitor: { update: vi.fn().mockImplementation((a: any) => Promise.resolve({ id: "v-1", ...a.data, name: "Test Person", phone: "0590000001" })) },
    personAudit: { create: mockAuditCreate },
    debt: { create: mockDebtCreate },
  };
  mockTransaction.mockImplementation(async (fn: any) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSessionFindFirst.mockResolvedValue(null);
  mockRosterFindUnique.mockResolvedValue(null);
  // No phone conflict by default
  mockVisitorFindFirst.mockResolvedValue(null);
  mockAuditCreate.mockImplementation((a: any) => Promise.resolve(a.data));
  txMocks();
});

describe("convertType", () => {
  it("rejects converting to the same type (400, idempotent)", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen" });

    await expect(
      visitorsService.convertType("v-1", { type: "tamkeen" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects archived persons", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen", deletedAt: new Date() });

    await expect(
      visitorsService.convertType("v-1", { type: "subscriber" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects while a session is active", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen" });
    mockSessionFindFirst.mockResolvedValue({ id: "live" });

    await expect(
      visitorsService.convertType("v-1", { type: "subscriber" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("converts tamkeen → trainee on the same id + writes audit, no subscription", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen" });

    const result = await visitorsService.convertType(
      "v-1",
      { type: "trainee" },
      { id: "staff-1", name: "Admin" },
    );

    expect(result).toMatchObject({ id: "v-1", type: "trainee", fromType: "tamkeen" });
    expect(mockSubCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visitorId: "v-1",
        action: "convert-type",
        fromType: "tamkeen",
        toType: "trainee",
        actorId: "staff-1",
      }),
    });
  });

  it("requires subscription details when entering subscriber with no live sub", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen" });
    mockSubFindFirst.mockResolvedValue(null);

    await expect(
      visitorsService.convertType("v-1", { type: "subscriber" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates the Subscription in the same transaction when entering subscriber", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "tamkeen" });
    mockSubFindFirst.mockResolvedValue(null);
    mockSubCreate.mockImplementation((a: any) =>
      Promise.resolve({ id: "sub-new", ...a.data }),
    );

    const result = await visitorsService.convertType("v-1", {
      type: "subscriber",
      subscription: {
        packageType: "monthly",
        startDate: new Date("2026-10-01T00:00:00Z").toISOString(),
        endDate: new Date("2026-10-31T00:00:00Z").toISOString(),
        dailyQuotaHours: 6,
        amountPaid: 350,
      },
    });

    expect(mockSubCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ visitorId: "v-1", status: "active" }),
    });
    expect(result.subscription).toMatchObject({ id: "sub-new" });
  });

  it("returns 409 with the conflicting person when the phone is held by another managed person", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "visitor" });
    mockVisitorFindFirst.mockResolvedValue({
      id: "v-2",
      name: "Other Person",
      phone: "0590000001",
      type: "tamkeen",
      _count: { sessions: 3 },
    });

    const err = await visitorsService
      .convertType("v-1", { type: "subscriber" })
      .catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.conflictingPerson).toMatchObject({ id: "v-2", name: "Other Person" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("allows converting TO plain visitor even when the phone is shared", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "trainee" });

    const result = await visitorsService.convertType("v-1", { type: "visitor" });

    expect(result).toMatchObject({ id: "v-1", type: "visitor" });
    // No conflict lookup needed for plain visitors
    expect(mockRosterFindUnique).not.toHaveBeenCalled();
  });

  it("leaving employee does not 409 on the person's own roster row", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "employee" });
    // The roster row with the same phone is the person's own — skip it.
    mockRosterFindUnique.mockResolvedValue({ id: "roster-1", name: "Test Person" });

    const result = await visitorsService.convertType("v-1", { type: "trainee" });

    expect(result).toMatchObject({ id: "v-1", type: "trainee", fromType: "employee" });
    expect(mockRosterFindUnique).not.toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns 409 rosterOnly (no merge target) when another roster entry holds the phone", async () => {
    mockVisitorFindUnique.mockResolvedValue({ ...BASE, type: "visitor" });
    mockRosterFindUnique.mockResolvedValue({ id: "roster-9", name: "Roster Person" });

    const err = await visitorsService
      .convertType("v-1", { type: "trainee" })
      .catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.conflictingPerson).toMatchObject({
      id: null,
      name: "Roster Person",
      type: "employee",
      rosterOnly: true,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
