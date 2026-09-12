import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVisitorFindUnique, mockVisitorDelete, mockDeactivate } = vi.hoisted(
  () => ({
    mockVisitorFindUnique: vi.fn(),
    mockVisitorDelete: vi.fn(),
    mockDeactivate: vi.fn(),
  }),
);

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: {
      findUnique: mockVisitorFindUnique,
      delete: mockVisitorDelete,
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
});

describe("deleteSubscriber (Task 5)", () => {
  it("deactivates the Anoon QR copy with the deleted phone, fire-and-forget", async () => {
    mockVisitorFindUnique.mockResolvedValue({
      id: "v-1",
      type: "subscriber",
      phone: "0590000000",
    });
    mockVisitorDelete.mockImplementation((args: any) =>
      Promise.resolve({ id: "v-1", type: "subscriber", phone: "0590000000", ...args.where }),
    );

    await subscribersService.deleteSubscriber("v-1");

    expect(mockVisitorDelete).toHaveBeenCalledWith({ where: { id: "v-1" } });
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).toHaveBeenCalledWith("0590000000");
  });

  it("does NOT notify Anoon QR when the local delete never happens", async () => {
    mockVisitorFindUnique.mockResolvedValue(null);

    await expect(subscribersService.deleteSubscriber("missing")).rejects.toMatchObject(
      { statusCode: 404 },
    );
    expect(mockVisitorDelete).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("still returns the deleted visitor when the QR side reports failure", async () => {
    mockVisitorFindUnique.mockResolvedValue({
      id: "v-1",
      type: "subscriber",
      phone: "0590000000",
    });
    mockVisitorDelete.mockResolvedValue({ id: "v-1", phone: "0590000000" });
    // Fire-and-forget: a QR-side failure is a logged outcome, never a throw.
    mockDeactivate.mockResolvedValue({ ok: false, reason: "http-404" });

    const result = await subscribersService.deleteSubscriber("v-1");
    expect(result).toMatchObject({ id: "v-1" });
    expect(mockDeactivate).toHaveBeenCalledWith("0590000000");
  });
});
