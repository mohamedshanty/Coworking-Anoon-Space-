import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVisitorFindUnique,
  mockVisitorUpdate,
  mockSessionFindFirst,
  mockDebtFindMany,
  mockWalletFindUnique,
  mockDeactivate,
} = vi.hoisted(() => ({
  mockVisitorFindUnique: vi.fn(),
  mockVisitorUpdate: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockDebtFindMany: vi.fn(),
  mockWalletFindUnique: vi.fn(),
  mockDeactivate: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: {
      findUnique: mockVisitorFindUnique,
      update: mockVisitorUpdate,
    },
    session: {
      findFirst: mockSessionFindFirst,
    },
    debt: {
      findMany: mockDebtFindMany,
    },
    snackWallet: {
      findUnique: mockWalletFindUnique,
    },
  },
}));

vi.mock("../../lib/anoon-sync", () => ({
  syncMemberToAnoonQr: vi.fn(),
  deactivateMemberOnAnoonQr: mockDeactivate,
}));

import { subscribersService } from "./service";

beforeEach(() => {
  vi.resetAllMocks();
  mockDeactivate.mockResolvedValue({ ok: true });
  mockSessionFindFirst.mockResolvedValue(null);
  mockDebtFindMany.mockResolvedValue([]);
  mockWalletFindUnique.mockResolvedValue(null);
});

describe("deleteSubscriber (soft delete / archive)", () => {
  it("archives instead of hard-deleting, keeping all records", async () => {
    mockVisitorFindUnique.mockResolvedValue({
      id: "v-1",
      type: "subscriber",
      phone: "0590000000",
      name: "Test",
      deletedAt: null,
    });
    mockVisitorUpdate.mockImplementation((args: any) =>
      Promise.resolve({ id: "v-1", type: "subscriber", phone: "0590000000", ...args.data }),
    );

    const result = await subscribersService.deleteSubscriber("v-1");

    // Archive = update deletedAt, never prisma.visitor.delete
    expect(mockVisitorUpdate).toHaveBeenCalledWith({
      where: { id: "v-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result).toMatchObject({
      id: "v-1",
      outstandingDebts: { total: 0, count: 0 },
      walletBalance: 0,
    });
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).toHaveBeenCalledWith("0590000000");
  });

  it("blocks archiving a person with an active session", async () => {
    mockVisitorFindUnique.mockResolvedValue({
      id: "v-1",
      type: "subscriber",
      phone: "0590000000",
      name: "Test",
      deletedAt: null,
    });
    mockSessionFindFirst.mockResolvedValue({ id: "s-1" });

    await expect(subscribersService.deleteSubscriber("v-1")).rejects.toMatchObject(
      { statusCode: 400 },
    );
    expect(mockVisitorUpdate).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("does NOT notify Anoon QR when the person does not exist", async () => {
    mockVisitorFindUnique.mockResolvedValue(null);

    await expect(subscribersService.deleteSubscriber("missing")).rejects.toMatchObject(
      { statusCode: 404 },
    );
    expect(mockVisitorUpdate).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("returns debt/wallet warnings in the archive result", async () => {
    mockVisitorFindUnique.mockResolvedValue({
      id: "v-1",
      type: "subscriber",
      phone: "0590000000",
      name: "Test",
      deletedAt: null,
    });
    mockDebtFindMany.mockResolvedValue([{ amount: 50 }, { amount: 25.5 }]);
    mockWalletFindUnique.mockResolvedValue({ id: "w-1", balance: 7 });
    mockVisitorUpdate.mockImplementation((args: any) =>
      Promise.resolve({ id: "v-1", type: "subscriber", phone: "0590000000", ...args.data }),
    );

    const result = await subscribersService.deleteSubscriber("v-1");

    expect(result).toMatchObject({
      outstandingDebts: { total: 75.5, count: 2 },
      walletBalance: 7,
      hasWallet: true,
    });
  });
});
