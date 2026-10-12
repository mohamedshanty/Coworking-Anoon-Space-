import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPermissionFindUnique } = vi.hoisted(() => ({
  mockPermissionFindUnique: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    permission: {
      findUnique: mockPermissionFindUnique,
    },
  },
}));

import { authorize } from "./authorize";

function runMiddleware(
  pageKey: string,
  action: "view" | "edit" | "delete",
  user: any,
) {
  const mw = authorize(pageKey, action);
  const req: any = { user };
  const res: any = {};
  return new Promise<{ ok: boolean; err?: any }>((resolve) => {
    const next = (err?: any) => {
      if (err) resolve({ ok: false, err });
      else resolve({ ok: true });
    };
    void mw(req, res, next);
  });
}

const staffUser = { id: "s1", name: "Staff", username: "staff1", role: "staff" };
const adminUser = { id: "a1", name: "Admin", username: "admin", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPermissionFindUnique.mockResolvedValue(null);
});

describe("authorize default-deny per-action", () => {
  it("denies view/edit/delete when no Permission row exists", async () => {
    for (const action of ["view", "edit", "delete"] as const) {
      const r = await runMiddleware("المصروفات", action, staffUser);
      expect(r.ok).toBe(false);
      expect(r.err?.statusCode).toBe(403);
    }
    expect(mockPermissionFindUnique).toHaveBeenCalledTimes(3);
  });

  it("allows view but denies edit/delete for canView-only rows", async () => {
    mockPermissionFindUnique.mockResolvedValue({
      canView: true,
      canEdit: false,
      canDelete: false,
    });
    expect((await runMiddleware("المصروفات", "view", staffUser)).ok).toBe(true);
    const e = await runMiddleware("المصروفات", "edit", staffUser);
    expect(e.ok).toBe(false);
    expect(e.err?.statusCode).toBe(403);
    const d = await runMiddleware("المصروفات", "delete", staffUser);
    expect(d.ok).toBe(false);
    expect(d.err?.statusCode).toBe(403);
  });

  it("allows edit only with canEdit (canView true is not enough)", async () => {
    mockPermissionFindUnique.mockResolvedValue({
      canView: true,
      canEdit: true,
      canDelete: false,
    });
    expect((await runMiddleware("المصروفات", "edit", staffUser)).ok).toBe(true);
    const d = await runMiddleware("المصروفات", "delete", staffUser);
    expect(d.ok).toBe(false);
    expect(d.err?.statusCode).toBe(403);
  });

  it("allows delete only with canDelete", async () => {
    mockPermissionFindUnique.mockResolvedValue({
      canView: true,
      canEdit: true,
      canDelete: true,
    });
    expect((await runMiddleware("المصروفات", "delete", staffUser)).ok).toBe(true);
  });

  it("denies edit when canEdit false even if canView and canDelete true", async () => {
    mockPermissionFindUnique.mockResolvedValue({
      canView: true,
      canEdit: false,
      canDelete: true,
    });
    const e = await runMiddleware("المصروفات", "edit", staffUser);
    expect(e.ok).toBe(false);
    expect(e.err?.statusCode).toBe(403);
  });

  it("always allows admin without requiring a Permission row", async () => {
    mockPermissionFindUnique.mockResolvedValue(null);
    for (const action of ["view", "edit", "delete"] as const) {
      const r = await runMiddleware("المصروفات", action, adminUser);
      expect(r.ok).toBe(true);
    }
    expect(mockPermissionFindUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when no user on request", async () => {
    const r = await runMiddleware("المصروفات", "view", undefined);
    expect(r.ok).toBe(false);
    expect(r.err?.statusCode).toBe(401);
  });
});
