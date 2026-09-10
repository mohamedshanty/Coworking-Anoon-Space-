import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (same style as hotspot.service.test.ts)
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.HOTSPOT_USER_SECRET = "test-secret-key-for-testing";
});

const { mockEnsureUser } = vi.hoisted(() => ({
  mockEnsureUser: vi.fn(),
}));

vi.mock("../../lib/mikrotik", () => ({
  getMikrotik: () => ({ ensureUser: mockEnsureUser }),
}));

const {
  mockVisitorFindFirst,
  mockVisitorCreate,
  mockStaffFindUnique,
  mockStaffCreate,
  mockSessionFindFirst,
} = vi.hoisted(() => ({
  mockVisitorFindFirst: vi.fn(),
  mockVisitorCreate: vi.fn(),
  mockStaffFindUnique: vi.fn(),
  mockStaffCreate: vi.fn(),
  mockSessionFindFirst: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: { findFirst: mockVisitorFindFirst, create: mockVisitorCreate },
    staff: { findUnique: mockStaffFindUnique, create: mockStaffCreate },
    session: { findFirst: mockSessionFindFirst },
  },
}));

const { mockCheckIn } = vi.hoisted(() => ({
  mockCheckIn: vi.fn(),
}));

vi.mock("../sessions/service", () => ({
  sessionsService: { checkIn: mockCheckIn },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { integrationsService, resolveEffectivePlan } from "./service";
import { anoonCheckInSchema } from "./schema";
import { ApiError } from "../../lib/ApiError";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockVisitor(overrides: Record<string, any> = {}) {
  return {
    id: "v-1",
    name: "Test Person",
    phone: "0590000000",
    type: "visitor",
    ...overrides,
  };
}

function mockSession(overrides: Record<string, any> = {}) {
  return { id: "s-001", visitorId: "v-1", ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockVisitorFindFirst.mockResolvedValue(null);
  mockVisitorCreate.mockImplementation((args: any) =>
    Promise.resolve({ id: "v-new", ...args.data }),
  );
  mockStaffFindUnique.mockResolvedValue(null);
  mockSessionFindFirst.mockResolvedValue(null);
  mockCheckIn.mockImplementation((args: any) =>
    Promise.resolve({ id: "s-001", visitorId: args.visitorId }),
  );
  mockEnsureUser.mockResolvedValue(undefined);
});

async function expect404(promise: Promise<any>, message: string) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(404);
    expect((err as ApiError).message).toBe(message);
    return;
  }
  throw new Error(`Expected 404 "${message}" but the call succeeded`);
}

// ---------------------------------------------------------------------------
// Schema / backward compatibility
// ---------------------------------------------------------------------------

describe("anoonCheckInSchema", () => {
  it("defaults missing type to subscriber (legacy payload)", () => {
    const parsed = anoonCheckInSchema.parse({
      phone: "0590000003",
      name: "Legacy Subscriber",
    });
    expect(parsed.type).toBe("subscriber");
  });

  it("rejects an invalid visitor speed (40M)", () => {
    expect(() =>
      anoonCheckInSchema.parse({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        internetSpeed: "40M",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------

describe("visitor check-in", () => {
  it("new visitor 10M → session created, visitor-10m, ensureUser(visitor-10m)", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      routerProfile: "visitor-10m",
    } as any);

    expect(result.type).toBe("visitor");
    expect(result.alreadyActive).toBe(false);
    expect(result.session.id).toBe("s-001");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("visitor-10m");
    expect(mockVisitorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "visitor", phone: "0590000000" }),
      }),
    );
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: "0590000000", profile: "visitor-10m" }),
    );
  });

  it("new visitor 20M → visitor-20m", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
    } as any);

    expect(result.plan.internetSpeed).toBe("20M");
    expect(result.plan.routerProfile).toBe("visitor-20m");
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "visitor-20m" }),
    );
  });

  it("new visitor 30M → visitor-30m", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "30M",
    } as any);

    expect(result.plan.internetSpeed).toBe("30M");
    expect(result.plan.routerProfile).toBe("visitor-30m");
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "visitor-30m" }),
    );
  });

  it("speed/profile mismatch (20M + visitor-30m) must NOT grant 30M", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.plan.internetSpeed).toBe("20M");
    expect(result.plan.routerProfile).toBe("visitor-20m");
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "visitor-20m" }),
    );
  });

  it("rejects an unknown visitor router profile", async () => {
    await expect(
      integrationsService.anoonCheckIn({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        internetSpeed: "10M",
        routerProfile: "gold-100m",
      } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trainee
// ---------------------------------------------------------------------------

describe("trainee check-in", () => {
  it("ignores requested 30M/visitor-30m → noon-10m", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "trainee",
      name: "Test Trainee",
      phone: "0590000001",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.type).toBe("trainee");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "trainee" }),
      }),
    );
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "noon-10m" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Employee (Staff find-only)
// ---------------------------------------------------------------------------

describe("employee check-in", () => {
  it("existing Staff → session created, noon-10m, no Staff creation", async () => {
    mockStaffFindUnique.mockResolvedValue({
      id: "st-1",
      name: "Test Employee",
      phone: "0590000002",
    });

    const result = await integrationsService.anoonCheckIn({
      type: "employee",
      name: "Test Employee",
      phone: "0590000002",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.type).toBe("employee");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockStaffFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: "0590000002" } }),
    );
    expect(mockStaffCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "noon-10m" }),
    );
  });

  it("missing Staff → 404, no session, no router user, no records created", async () => {
    mockStaffFindUnique.mockResolvedValue(null);

    await expect404(
      integrationsService.anoonCheckIn({
        type: "employee",
        name: "Ghost",
        phone: "0590000009",
      } as any),
      "Staff member not found",
    );

    expect(mockStaffCreate).not.toHaveBeenCalled();
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Subscriber (legacy behavior preserved)
// ---------------------------------------------------------------------------

describe("subscriber check-in", () => {
  it("existing subscriber → session, noon-10m, never auto-created", async () => {
    mockVisitorFindFirst.mockResolvedValue(
      mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
    );

    const result = await integrationsService.anoonCheckIn({
      type: "subscriber",
      name: "Legacy Subscriber",
      phone: "0590000003",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledWith({ visitorId: "v-sub" });
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "noon-10m" }),
    );
  });

  it("missing subscriber → 404 'Visitor not found', nothing created", async () => {
    mockVisitorFindFirst.mockResolvedValue(null);

    await expect404(
      integrationsService.anoonCheckIn({
        type: "subscriber",
        name: "Nobody",
        phone: "0590000004",
      } as any),
      "Visitor not found",
    );

    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });

  it("legacy request without type follows the subscriber flow", async () => {
    mockVisitorFindFirst.mockResolvedValue(
      mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
    );

    const parsed = anoonCheckInSchema.parse({
      phone: "0590000003",
      name: "Legacy Subscriber",
    });
    const result = await integrationsService.anoonCheckIn(parsed);

    expect(result.type).toBe("subscriber");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Idempotency + router failure
// ---------------------------------------------------------------------------

describe("idempotency and router failure", () => {
  it("duplicate check-in returns the existing session without duplicates", async () => {
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockSessionFindFirst.mockResolvedValueOnce(null); // first call: no session
    mockSessionFindFirst.mockResolvedValueOnce(mockSession()); // second: existing

    const first = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);
    const second = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);

    expect(first.alreadyActive).toBe(false);
    expect(second.alreadyActive).toBe(true);
    expect(second.session.id).toBe("s-001");
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
    expect(mockEnsureUser).toHaveBeenCalledTimes(1);
  });

  it("router failure still returns the successful local session", async () => {
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockEnsureUser.mockRejectedValueOnce(new Error("Router connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await integrationsService.anoonCheckIn({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        internetSpeed: "10M",
      } as any);

      expect(result.session.id).toBe("s-001");
      expect(result.alreadyActive).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("reuses an already-open session without check-in or router calls", async () => {
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockSessionFindFirst.mockResolvedValue(mockSession());

    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
    } as any);

    expect(result.alreadyActive).toBe(true);
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Plan rules unit checks
// ---------------------------------------------------------------------------

describe("resolveEffectivePlan", () => {
  it("forces noon-10m for subscriber/trainee/employee even with 30M", () => {
    for (const type of ["subscriber", "trainee", "employee"] as const) {
      const plan = resolveEffectivePlan(type, "30M", "visitor-30m");
      expect(plan.routerProfile).toBe("noon-10m");
      expect(plan.mbps).toBe(10);
    }
  });

  it("maps visitor speeds to visitor profiles", () => {
    expect(resolveEffectivePlan("visitor", "10M").routerProfile).toBe("visitor-10m");
    expect(resolveEffectivePlan("visitor", "20M").routerProfile).toBe("visitor-20m");
    expect(resolveEffectivePlan("visitor", "30M").routerProfile).toBe("visitor-30m");
  });

  it("defaults a visitor with no speed to visitor-10m", () => {
    expect(resolveEffectivePlan("visitor").routerProfile).toBe("visitor-10m");
  });
});
