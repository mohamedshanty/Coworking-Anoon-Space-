import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVisitorFindMany,
  mockEmployeeFindMany,
  mockTransaction,
  mockTxCreate,
  mockTxUpdate,
  mockSyncMember,
} = vi.hoisted(() => ({
  mockVisitorFindMany: vi.fn(),
  mockEmployeeFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockTxCreate: vi.fn(),
  mockTxUpdate: vi.fn(),
  mockSyncMember: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: { findMany: mockVisitorFindMany },
    employeeRoster: { findMany: mockEmployeeFindMany },
    $transaction: mockTransaction,
  },
}));

vi.mock("../../lib/anoon-sync", () => ({
  syncMemberToAnoonQr: mockSyncMember,
  deactivateMemberOnAnoonQr: vi.fn(),
}));

import { traineesService } from "./service";

beforeEach(() => {
  vi.resetAllMocks();
  // Default: empty DB — every phone is free.
  // validateTraineeImport issues findMany 3x in order:
  // trainees, subscribers, employees (via Promise.all, but mock
  // implementation branches on the `type` / model instead of order).
  mockVisitorFindMany.mockImplementation((args: any) => {
    if (args?.where?.type === "trainee") return Promise.resolve([]);
    return Promise.resolve([]);
  });
  mockEmployeeFindMany.mockResolvedValue([]);
  mockSyncMember.mockResolvedValue({ ok: true });
  mockTransaction.mockImplementation(async (cb: any) =>
    cb({ visitor: { create: mockTxCreate, update: mockTxUpdate } }),
  );
  mockTxCreate.mockImplementation((args: any) =>
    Promise.resolve({ id: "new-id", ...args.data }),
  );
  mockTxUpdate.mockImplementation((args: any) =>
    Promise.resolve({ id: args.where.id, ...args.data }),
  );
});

describe("validateTraineeImport", () => {
  it("valid name/phone rows → toCreate with normalized phones", async () => {
    const preview = await traineesService.validateTraineeImport([
      { name: "أحمد", phone: "0599000001" },
      { name: "سارة", phone: "972599000002" },
    ]);

    expect(preview.summary).toMatchObject({ total: 2, toCreate: 2, toUpdate: 0, rejected: 0 });
    expect(preview.toCreate.map((r) => r.phone)).toEqual(["0599000001", "0599000002"]);
  });

  it("missing/invalid phones are rejected with a reason per row", async () => {
    const preview = await traineesService.validateTraineeImport([
      { name: "No Phone", phone: "" },
      { name: "Bad Phone", phone: "not-a-phone" },
      { name: "", phone: "0599000003" },
    ]);

    expect(preview.toCreate).toHaveLength(0);
    expect(preview.rejected).toHaveLength(3);
    for (const r of preview.rejected) expect(r.reason).toBeTruthy();
  });

  it("duplicate phones within the file are flagged (first wins)", async () => {
    const preview = await traineesService.validateTraineeImport([
      { name: "First", phone: "0599000001" },
      { name: "Second", phone: "0599-000-001" },
    ]);

    expect(preview.toCreate).toHaveLength(1);
    expect(preview.toCreate[0].name).toBe("First");
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].reason).toMatch(/مكرر/);
  });

  it("existing trainee phone → toUpdate (name refresh), not an error", async () => {
    mockVisitorFindMany.mockImplementation((args: any) => {
      if (args?.where?.type === "trainee") {
        return Promise.resolve([
          { id: "v-t1", phone: "0599000001", name: "Old Name" },
        ]);
      }
      return Promise.resolve([]);
    });

    const preview = await traineesService.validateTraineeImport([
      { name: "New Name", phone: "0599000001" },
    ]);

    expect(preview.toUpdate).toHaveLength(1);
    expect(preview.toUpdate[0]).toMatchObject({
      name: "New Name",
      phone: "0599000001",
      existingId: "v-t1",
      existingName: "Old Name",
    });
    expect(preview.rejected).toHaveLength(0);
  });

  it("subscriber / employee phones are rejected without affecting the rest", async () => {
    mockVisitorFindMany.mockImplementation((args: any) => {
      if (args?.where?.type === "trainee") return Promise.resolve([]);
      // subscriber check: second findMany call
      return Promise.resolve([{ id: "v-sub", phone: "0599000001" }]);
    });
    mockEmployeeFindMany.mockResolvedValue([{ id: "e-1", phone: "0599000002" }]);

    const preview = await traineesService.validateTraineeImport([
      { name: "Sub Person", phone: "0599000001" },
      { name: "Emp Person", phone: "0599000002" },
      { name: "Fine Person", phone: "0599000003" },
    ]);

    expect(preview.toCreate).toHaveLength(1);
    expect(preview.toCreate[0].phone).toBe("0599000003");
    expect(preview.rejected).toHaveLength(2);
    expect(preview.rejected[0].reason).toMatch(/مشترك/);
    expect(preview.rejected[1].reason).toMatch(/موظف/);
  });
});

describe("commitTraineeImport", () => {
  it("creates new trainees as Visitor rows with type=trainee in one transaction", async () => {
    const result = await traineesService.commitTraineeImport([
      { name: "أحمد", phone: "0599000001" },
      { name: "سارة", phone: "0599000002" },
    ]);

    expect(result.summary).toMatchObject({ created: 2, updated: 0, rejected: 0 });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxCreate).toHaveBeenCalledTimes(2);
    expect(mockTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "trainee" }) }),
    );
    // Fire-and-forget Anoon QR sync per created row
    expect(mockSyncMember).toHaveBeenCalledTimes(2);
    expect(mockSyncMember).toHaveBeenCalledWith(
      expect.objectContaining({ type: "trainee", packageType: "monthly" }),
    );
  });

  it("re-upload of an existing trainee updates the name instead of erroring", async () => {
    mockVisitorFindMany.mockImplementation((args: any) => {
      if (args?.where?.type === "trainee") {
        return Promise.resolve([{ id: "v-t1", phone: "0599000001", name: "Old" }]);
      }
      return Promise.resolve([]);
    });

    const result = await traineesService.commitTraineeImport([
      { name: "New", phone: "0599000001" },
    ]);

    expect(result.summary).toMatchObject({ created: 0, updated: 1, rejected: 0 });
    expect(mockTxUpdate).toHaveBeenCalledWith({
      where: { id: "v-t1" },
      data: { name: "New" },
    });
    expect(mockSyncMember).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0599000001", name: "New", type: "trainee" }),
    );
  });

  it("subscriber/employee rows are skipped; the rest still commits", async () => {
    mockVisitorFindMany.mockImplementation((args: any) => {
      if (args?.where?.type === "trainee") return Promise.resolve([]);
      return Promise.resolve([{ id: "v-sub", phone: "0599000001" }]);
    });

    const result = await traineesService.commitTraineeImport([
      { name: "Sub", phone: "0599000001" },
      { name: "Ok", phone: "0599000003" },
    ]);

    expect(result.summary).toMatchObject({ created: 1, updated: 0, rejected: 1 });
    expect(mockTxCreate).toHaveBeenCalledTimes(1);
    expect(mockTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "0599000003" }) }),
    );
  });

  it("fully-rejected batch performs no transaction", async () => {
    const result = await traineesService.commitTraineeImport([
      { name: "", phone: "" },
    ]);

    expect(result.summary).toMatchObject({ created: 0, updated: 0, rejected: 1 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockSyncMember).not.toHaveBeenCalled();
  });
});
