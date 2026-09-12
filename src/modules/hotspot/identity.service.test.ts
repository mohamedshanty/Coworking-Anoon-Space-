import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockStaffFindUnique, mockVisitorFindFirst, mockVisitorCreate, mockTraineeFindFirst } = vi.hoisted(() => ({
  mockStaffFindUnique: vi.fn(),
  mockVisitorFindFirst: vi.fn(),
  mockVisitorCreate: vi.fn(),
  mockTraineeFindFirst: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    staff: { findUnique: mockStaffFindUnique },
    visitor: { findFirst: mockVisitorFindFirst, create: mockVisitorCreate },
    trainee: { findFirst: mockTraineeFindFirst },
  },
}));

vi.mock("../../lib/subscription", () => ({
  getEffectiveStatus: (sub: { status: string; endDate: Date | string }) => {
    if (sub.status === "active" && new Date(sub.endDate) < new Date()) return "expired";
    return sub.status;
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { resolveIdentity, ensureVisitor } from "./identity.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVisitor(overrides: Record<string, any> = {}) {
  return {
    id: "v-001",
    name: "Test User",
    type: "visitor",
    subscriptions: [],
    ...overrides,
  };
}

function makeSubscriber(overrides: Record<string, any> = {}) {
  return {
    id: "v-sub",
    name: "Subscriber User",
    type: "subscriber",
    subscriptions: [
      {
        id: "sub-001",
        status: "active",
        endDate: new Date(Date.now() + 30 * 86400_000),
        packageType: "monthly",
      },
    ],
    ...overrides,
  };
}

function makeExpiredSubscriber() {
  return makeSubscriber({
    id: "v-exp",
    name: "Expired User",
    subscriptions: [
      {
        id: "sub-exp",
        status: "active",
        endDate: new Date(Date.now() - 5 * 86400_000),
        packageType: "weekly",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // reset (not just clear): mock implementations must not leak between
  // tests — e.g. a staff record set by an EMPLOYEE test would make every
  // later test resolve as "employee".
  vi.resetAllMocks();
});

describe("resolveIdentity", () => {
  // ── Phone normalization ──────────────────────────────────────────────

  describe("phone normalization", () => {
    it("normalizes 0599123456 as-is", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("0599123456");
      expect(result.phone).toBe("0599123456");
    });

    it("normalizes 970599123456 to 0599123456", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("970599123456");
      expect(result.phone).toBe("0599123456");
    });

    it("normalizes 972599123456 to 0599123456", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("972599123456");
      expect(result.phone).toBe("0599123456");
    });

    it("normalizes 599123456 (9 digits) to 0599123456", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("599123456");
      expect(result.phone).toBe("0599123456");
    });

    it("normalizes +970599123456 to 0599123456", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("+970599123456");
      expect(result.phone).toBe("0599123456");
    });

    it("returns raw phone for invalid format", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("123");
      expect(result.phone).toBe("123");
      expect(result.kind).toBe("visitor");
    });

    it("returns visitor for empty string", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("");
      expect(result.kind).toBe("visitor");
    });
  });

  // ── Visitor (no records) ─────────────────────────────────────────────

  describe("VISITOR", () => {
    it("returns visitor when no records found", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("visitor");
      expect(result.name).toBe("Visitor");
      expect(result.visitorId).toBeUndefined();
    });

    it("returns visitor with existing record", async () => {
      mockVisitorFindFirst.mockResolvedValue(makeVisitor({ id: "v-100", name: "John" }));
      mockTraineeFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("visitor");
      expect(result.visitorId).toBe("v-100");
      expect(result.name).toBe("John");
    });

    it("uses fallbackName when visitor has no name", async () => {
      mockVisitorFindFirst.mockResolvedValue(makeVisitor({ name: null }));
      mockTraineeFindFirst.mockResolvedValue(null);
      const result = await resolveIdentity("0599123456", "Fallback");
      expect(result.name).toBe("Fallback");
    });
  });

  // ── Subscriber ───────────────────────────────────────────────────────

  describe("SUBSCRIBER", () => {
    it("identifies active subscriber", async () => {
      mockVisitorFindFirst.mockResolvedValue(makeSubscriber());
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("subscriber");
      expect(result.visitorId).toBe("v-sub");
      expect(result.subscriberId).toBe("sub-001");
      expect(result.needsRenewal).toBe(false);
      expect(result.note).toContain("active");
    });

    it("identifies expired subscriber with needsRenewal", async () => {
      mockVisitorFindFirst.mockResolvedValue(makeExpiredSubscriber());
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("subscriber");
      expect(result.needsRenewal).toBe(true);
      expect(result.note).toContain("expired");
    });

    it("treats paused subscription as not active", async () => {
      mockVisitorFindFirst.mockResolvedValue(
        makeSubscriber({
          subscriptions: [
            { id: "sub-p", status: "paused", endDate: new Date(Date.now() + 30 * 86400_000), packageType: "monthly" },
          ],
        }),
      );
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("subscriber");
      expect(result.needsRenewal).toBe(true);
    });

    it("shows weekly package label", async () => {
      mockVisitorFindFirst.mockResolvedValue(
        makeSubscriber({
          subscriptions: [
            { id: "sub-w", status: "active", endDate: new Date(Date.now() + 7 * 86400_000), packageType: "weekly" },
          ],
        }),
      );
      const result = await resolveIdentity("0599123456");
      expect(result.note).toContain("Weekly");
    });

    it("shows half-month package label", async () => {
      mockVisitorFindFirst.mockResolvedValue(
        makeSubscriber({
          subscriptions: [
            { id: "sub-h", status: "active", endDate: new Date(Date.now() + 15 * 86400_000), packageType: "half_month" },
          ],
        }),
      );
      const result = await resolveIdentity("0599123456");
      expect(result.note).toContain("Half-month");
    });

    it("queries only subscriber-type records so duplicate plain-visitor rows can't shadow a subscriber", async () => {
      // Regression: production had a phone with BOTH a subscriber row and a
      // plain visitor row. The subscriber query must filter by type so the
      // duplicate visitor row is never returned and billed as a visitor.
      mockVisitorFindFirst.mockResolvedValue(null);
      mockTraineeFindFirst.mockResolvedValue(null);

      const result = await resolveIdentity("0599123456");

      expect(result.kind).toBe("visitor");
      expect(mockVisitorFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: "0599123456",
            type: "subscriber",
            subscriptions: { some: {} },
          }),
        }),
      );
    });
  });

  // ── Employee ─────────────────────────────────────────────────────────

  describe("EMPLOYEE", () => {
    it("identifies employee by phone and returns staffId", async () => {
      mockStaffFindUnique.mockResolvedValue({ id: "st-1", name: "Ahmad Staff" });

      const result = await resolveIdentity("0599123456");

      expect(result.kind).toBe("employee");
      expect(result.staffId).toBe("st-1");
      expect(result.name).toBe("Ahmad Staff");
      expect(result.note).toBe("Staff");
    });

    it("looks up staff with the NORMALIZED phone", async () => {
      mockStaffFindUnique.mockResolvedValue({ id: "st-1", name: "Ahmad Staff" });

      await resolveIdentity("+970599123456");

      expect(mockStaffFindUnique).toHaveBeenCalledWith({
        where: { phone: "0599123456" },
        select: { id: true, name: true },
      });
    });

    it("employee wins over subscriber/visitor rows with the same phone (never billed)", async () => {
      mockStaffFindUnique.mockResolvedValue({ id: "st-9", name: "Staff" });

      const result = await resolveIdentity("0599123456");

      expect(result.kind).toBe("employee");
      // Short-circuits at the top — subscriber/trainee/visitor never queried
      expect(mockVisitorFindFirst).not.toHaveBeenCalled();
      expect(mockTraineeFindFirst).not.toHaveBeenCalled();
    });

    it("falls back to phone as name when staff name is missing", async () => {
      mockStaffFindUnique.mockResolvedValue({ id: "st-2", name: null });

      const result = await resolveIdentity("0599123456");

      expect(result.kind).toBe("employee");
      expect(result.name).toBe("0599123456");
    });
  });

  // ── Trainee ──────────────────────────────────────────────────────────

  describe("TRAINEE", () => {
    it("identifies trainee in current course", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      mockTraineeFindFirst.mockResolvedValue({
        id: "t-001",
        name: "Trainee User",
        course: { name: "React Workshop" },
      });

      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("trainee");
      expect(result.name).toBe("Trainee User");
      expect(result.note).toContain("React Workshop");
    });

    it("does not identify as trainee if course is in the past", async () => {
      mockVisitorFindFirst.mockResolvedValue(null);
      mockTraineeFindFirst.mockResolvedValue(null);

      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("visitor");
    });
  });

  // ── Priority ─────────────────────────────────────────────────────────

  describe("priority order", () => {
    it("subscriber wins over visitor", async () => {
      mockVisitorFindFirst.mockResolvedValue(makeSubscriber());
      const result = await resolveIdentity("0599123456");
      expect(result.kind).toBe("subscriber");
    });
  });
});

// ---------------------------------------------------------------------------
// ensureVisitor
// ---------------------------------------------------------------------------

describe("ensureVisitor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns existing visitor ID when visitor with phone exists", async () => {
    mockVisitorFindFirst.mockResolvedValue({ id: "v-existing" });

    const result = await ensureVisitor("0599123456", "New Name");

    expect(result).toBe("v-existing");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
  });

  it("creates new visitor when phone not found", async () => {
    mockVisitorFindFirst.mockResolvedValue(null);
    mockVisitorCreate.mockResolvedValue({ id: "v-new" });

    const result = await ensureVisitor("0599123456", "Brand New");

    expect(result).toBe("v-new");
    expect(mockVisitorCreate).toHaveBeenCalledWith({
      data: { name: "Brand New", phone: "0599123456", type: "visitor", source: "WIFI_PORTAL" },
      select: { id: true },
    });
  });

  it("tags self-registered visitors with source=WIFI_PORTAL so the report can distinguish them from reception check-ins", async () => {
    // Regression: ensureVisitor used to create the row with name/phone/type
    // only. On the visitor's second visit, the existing-row branch returned
    // the old id, and the sessionsService.checkIn path never wrote
    // source because the visitor already existed. Every wifi self-registration
    // therefore showed up in reports as "no source".
    mockVisitorFindFirst.mockResolvedValue(null);
    mockVisitorCreate.mockResolvedValue({ id: "v-new-2" });

    await ensureVisitor("0599999999", "Self Reg");

    expect(mockVisitorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "WIFI_PORTAL" }),
      }),
    );
  });

  it("does NOT open an attendance session (no checkIn call)", async () => {
    mockVisitorFindFirst.mockResolvedValue(null);
    mockVisitorCreate.mockResolvedValue({ id: "v-no-session" });

    await ensureVisitor("0599123456", "No Session");

    // ensureVisitor should only create the visitor record —
    // session creation is portalLogin's job via sessionsService.checkIn
    expect(mockVisitorCreate).toHaveBeenCalledTimes(1);
    // No session-related mocks should have been called
  });
});
