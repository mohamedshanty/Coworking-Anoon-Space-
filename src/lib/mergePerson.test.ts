import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVisitorFindUnique,
  mockSessionFindFirst,
  mockSessionFindMany,
  mockSubscriptionFindMany,
  mockNoteFindMany,
  mockDebtFindMany,
  mockNetFindMany,
  mockSaleFindMany,
  mockWalletFindUnique,
  mockTx,
  mockTransaction,
} = vi.hoisted(() => ({
  mockVisitorFindUnique: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSessionFindMany: vi.fn(),
  mockSubscriptionFindMany: vi.fn(),
  mockNoteFindMany: vi.fn(),
  mockDebtFindMany: vi.fn(),
  mockNetFindMany: vi.fn(),
  mockSaleFindMany: vi.fn(),
  mockWalletFindUnique: vi.fn(),
  mockTx: {
    session: { updateMany: vi.fn() },
    subscription: { updateMany: vi.fn() },
    visitorNote: { updateMany: vi.fn() },
    debt: { updateMany: vi.fn() },
    netSession: { updateMany: vi.fn() },
    sale: { updateMany: vi.fn() },
    snackWallet: { findUnique: vi.fn(), update: vi.fn() },
    visitor: { update: vi.fn() },
  },
  mockTransaction: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    visitor: { findUnique: mockVisitorFindUnique },
    session: { findFirst: mockSessionFindFirst, findMany: mockSessionFindMany },
    subscription: { findMany: mockSubscriptionFindMany },
    visitorNote: { findMany: mockNoteFindMany },
    debt: { findMany: mockDebtFindMany },
    netSession: { findMany: mockNetFindMany },
    sale: { findMany: mockSaleFindMany },
    snackWallet: { findUnique: mockWalletFindUnique },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import { mergePerson } from "./mergePerson";

const SRC = { id: "src-1", name: "Old Name", phone: "0590000001", type: "visitor", deletedAt: null };
const TGT = { id: "tgt-1", name: "New Name", phone: "0590000002", type: "trainee", deletedAt: null };

function mockChildrenEmpty() {
  mockSessionFindFirst.mockResolvedValue(null);
  mockSessionFindMany.mockResolvedValue([]);
  mockSubscriptionFindMany.mockResolvedValue([]);
  mockNoteFindMany.mockResolvedValue([]);
  mockDebtFindMany.mockResolvedValue([]);
  mockNetFindMany.mockResolvedValue([]);
  mockSaleFindMany.mockResolvedValue([]);
  mockWalletFindUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockVisitorFindUnique.mockImplementation((args: any) =>
    Promise.resolve(args.where.id === "src-1" ? { ...SRC } : { ...TGT }),
  );
  mockChildrenEmpty();
  mockTransaction.mockImplementation(async (fn: any) => fn(mockTx));
  mockTx.visitor.update.mockResolvedValue({ deletedAt: new Date("2026-10-04T00:00:00Z") });
});

describe("mergePerson", () => {
  it("re-links all children and archives the source (never hard-deletes)", async () => {
    mockSessionFindMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    mockSubscriptionFindMany.mockResolvedValue([{ id: "sub1" }]);
    mockDebtFindMany.mockResolvedValue([{ id: "d1" }]);
    mockSaleFindMany.mockResolvedValue([{ id: "sale1" }]);

    const summary = await mergePerson("src-1", "tgt-1");

    expect(mockTx.session.updateMany).toHaveBeenCalledWith({
      where: { visitorId: "src-1" },
      data: { visitorId: "tgt-1" },
    });
    expect(mockTx.subscription.updateMany).toHaveBeenCalledWith({
      where: { visitorId: "src-1" },
      data: { visitorId: "tgt-1" },
    });
    expect(mockTx.visitorNote.updateMany).toHaveBeenCalled();
    expect(mockTx.debt.updateMany).toHaveBeenCalledWith({
      where: { visitorId: "src-1" },
      data: { visitorId: "tgt-1", name: "New Name", phone: "0590000002" },
    });
    expect(mockTx.netSession.updateMany).toHaveBeenCalled();
    expect(mockTx.sale.updateMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ["s1", "s2"] } },
      data: { linkedName: "New Name" },
    });
    // Archive = update deletedAt; no delete call exists anywhere
    expect(mockTx.visitor.update).toHaveBeenCalledWith({
      where: { id: "src-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(summary.moved).toMatchObject({ sessions: 2, subscriptions: 1, debts: 1, sales: 1 });
    expect(summary.sourceArchivedAt).toBeTruthy();
  });

  it("refuses when either side has an active session", async () => {
    mockSessionFindFirst.mockResolvedValue({ id: "live", visitorId: "src-1" });

    await expect(mergePerson("src-1", "tgt-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses merging into an archived target", async () => {
    mockVisitorFindUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.id === "src-1" ? { ...SRC } : { ...TGT, deletedAt: new Date() },
      ),
    );

    await expect(mergePerson("src-1", "tgt-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("dryRun writes nothing but reports projected counts", async () => {
    mockSessionFindMany.mockResolvedValue([{ id: "s1" }]);

    const summary = await mergePerson("src-1", "tgt-1", { dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.moved.sessions).toBe(1);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockTx.visitor.update).not.toHaveBeenCalled();
  });

  it("is idempotent on an already-merged source", async () => {
    mockVisitorFindUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.id === "src-1" ? { ...SRC, deletedAt: new Date("2026-10-01T00:00:00Z") } : { ...TGT },
      ),
    );

    const summary = await mergePerson("src-1", "tgt-1");

    expect(summary.noop).toBe(true);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
