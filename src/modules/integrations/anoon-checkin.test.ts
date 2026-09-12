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
  mockEmployeeFindUnique,
  mockSessionFindFirst,
  mockSettingsFindFirst,
} = vi.hoisted(() => ({
  mockVisitorFindFirst: vi.fn(),
  mockVisitorCreate: vi.fn(),
  mockEmployeeFindUnique: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSettingsFindFirst: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: { findFirst: mockVisitorFindFirst, create: mockVisitorCreate },
    employeeRoster: { findUnique: mockEmployeeFindUnique },
    session: { findFirst: mockSessionFindFirst },
    settings: { findFirst: mockSettingsFindFirst },
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

import { integrationsService, resolveEffectivePlan, resolveMember } from "./service";
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
  mockEmployeeFindUnique.mockResolvedValue(null);
  mockSessionFindFirst.mockResolvedValue(null);
  // Base seat price for surcharge tests (Settings.hourlyRate).
  mockSettingsFindFirst.mockResolvedValue({ hourlyRate: 10 });
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
  it("defaults missing type to subscriber (legacy payload → member path)", () => {
    const parsed = anoonCheckInSchema.parse({
      phone: "0590000003",
      name: "Legacy Subscriber",
    });
    expect(parsed.type).toBe("subscriber");
  });

  it("accepts the two new tabs plus the three legacy values", () => {
    for (const type of ["member", "visitor", "subscriber", "trainee", "employee"]) {
      const parsed = anoonCheckInSchema.parse({
        type,
        phone: "0590000000",
        name: "Someone",
      });
      expect(parsed.type).toBe(type);
    }
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
// resolveMember unit checks
// ---------------------------------------------------------------------------

describe("resolveMember", () => {
  it("active roster row → employee (visitor table never queried)", async () => {
    mockEmployeeFindUnique.mockResolvedValue({
      id: "e-1",
      name: "Test Employee",
      phone: "0590000002",
      active: true,
    });

    const resolved = await resolveMember("0590000002");

    expect(resolved.type).toBe("employee");
    expect(mockVisitorFindFirst).not.toHaveBeenCalled();
  });

  it("inactive roster row falls through to the trainee check", async () => {
    mockEmployeeFindUnique.mockResolvedValue({
      id: "e-1",
      name: "Ex Employee",
      phone: "0590000002",
      active: false,
    });
    mockVisitorFindFirst.mockResolvedValueOnce(
      mockVisitor({ id: "v-t", type: "trainee", phone: "0590000002" }),
    );

    const resolved = await resolveMember("0590000002");

    expect(resolved.type).toBe("trainee");
  });

  it("trainee Visitor row → trainee", async () => {
    mockVisitorFindFirst.mockResolvedValueOnce(
      mockVisitor({ id: "v-t", type: "trainee", phone: "0590000001" }),
    );

    const resolved = await resolveMember("0590000001");

    expect(resolved.type).toBe("trainee");
    expect(mockVisitorFindFirst).toHaveBeenCalledTimes(1);
  });

  it("subscription-backed Visitor row → subscriber", async () => {
    mockVisitorFindFirst
      .mockResolvedValueOnce(null) // trainee check: no match
      .mockResolvedValueOnce(
        mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
      );

    const resolved = await resolveMember("0590000003");

    expect(resolved.type).toBe("subscriber");
    expect(mockVisitorFindFirst).toHaveBeenCalledTimes(2);
  });

  it("unknown phone → 404 with the front-desk message", async () => {
    mockVisitorFindFirst.mockResolvedValue(null);

    await expect404(
      resolveMember("0590000009"),
      "This phone number is not registered. Please contact the front desk.",
    );
  });
});

// ---------------------------------------------------------------------------
// Visitors (unchanged tab)
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
    expect(result.requestedType).toBe("visitor");
    expect(result.resolvedType).toBe("visitor");
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

  it("rejects an unknown visitor router profile before creating anything", async () => {
    await expect(
      integrationsService.anoonCheckIn({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        internetSpeed: "10M",
        routerProfile: "gold-100m",
      } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Member tab (unified resolution)
// ---------------------------------------------------------------------------

describe("member check-in", () => {
  it("subscriber phone → noon-10m, base rate, never auto-created", async () => {
    mockVisitorFindFirst
      .mockResolvedValueOnce(null) // trainee check
      .mockResolvedValueOnce(
        mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
      );

    const result = await integrationsService.anoonCheckIn({
      type: "member",
      name: "Member Subscriber",
      phone: "0590000003",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.requestedType).toBe("member");
    expect(result.resolvedType).toBe("subscriber");
    expect(result.type).toBe("subscriber");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "v-sub", hourlyRate: 10 }),
    );
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "noon-10m" }),
    );
  });

  it("trainee phone → noon-10m, requested speed ignored, never auto-created", async () => {
    mockVisitorFindFirst.mockResolvedValueOnce(
      mockVisitor({ id: "v-t", type: "trainee", phone: "0590000001" }),
    );

    const result = await integrationsService.anoonCheckIn({
      type: "member",
      name: "Member Trainee",
      phone: "0590000001",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.resolvedType).toBe("trainee");
    expect(result.type).toBe("trainee");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "v-t", hourlyRate: 10 }),
    );
  });

  it("employee roster phone → noon-10m, anchored on a Visitor row", async () => {
    mockEmployeeFindUnique.mockResolvedValue({
      id: "e-1",
      name: "Test Employee",
      phone: "0590000002",
      active: true,
    });
    // No attendance anchor yet → findOrCreateVisitor creates one.
    mockVisitorFindFirst.mockResolvedValue(null);

    const result = await integrationsService.anoonCheckIn({
      type: "member",
      name: "Test Employee",
      phone: "0590000002",
      internetSpeed: "30M",
      routerProfile: "visitor-30m",
    } as any);

    expect(result.resolvedType).toBe("employee");
    expect(result.type).toBe("employee");
    expect(result.plan.internetSpeed).toBe("10M");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "visitor",
          phone: "0590000002",
          name: "Test Employee",
        }),
      }),
    );
    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "v-new", hourlyRate: 10 }),
    );
    expect(mockEnsureUser).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "noon-10m" }),
    );
  });

  it("unregistered phone → 404, nothing created", async () => {
    mockVisitorFindFirst.mockResolvedValue(null);

    await expect404(
      integrationsService.anoonCheckIn({
        type: "member",
        name: "Nobody",
        phone: "0590000009",
      } as any),
      "This phone number is not registered. Please contact the front desk.",
    );

    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });

  it("legacy type=subscriber follows the member path", async () => {
    mockVisitorFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
      );

    const parsed = anoonCheckInSchema.parse({
      type: "subscriber",
      phone: "0590000003",
      name: "Legacy Subscriber",
    });
    const result = await integrationsService.anoonCheckIn(parsed);

    expect(result.requestedType).toBe("member");
    expect(result.resolvedType).toBe("subscriber");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });

  it("legacy request without type follows the member path", async () => {
    mockVisitorFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
      );

    const parsed = anoonCheckInSchema.parse({
      phone: "0590000003",
      name: "Legacy Subscriber",
    });
    const result = await integrationsService.anoonCheckIn(parsed);

    expect(result.requestedType).toBe("member");
    expect(result.resolvedType).toBe("subscriber");
    expect(result.plan.routerProfile).toBe("noon-10m");
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Hourly rate: base seat price + visitor internet surcharge (Task 1)
// ---------------------------------------------------------------------------

describe("hourly rate surcharge", () => {
  it("visitor 20M → Session hourlyRate = base (10) + surcharge (4)", async () => {
    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 14 }),
    );
  });

  it("visitor 10M → Session hourlyRate = base (10) + surcharge (3)", async () => {
    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 13 }),
    );
  });

  it("member subscriber → Session hourlyRate = base (10), no surcharge", async () => {
    mockVisitorFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        mockVisitor({ id: "v-sub", type: "subscriber", phone: "0590000003" }),
      );

    await integrationsService.anoonCheckIn({
      type: "member",
      name: "Member Subscriber",
      phone: "0590000003",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "v-sub", hourlyRate: 10 }),
    );
  });

  it("idempotent replay does not re-fetch settings or re-check-in", async () => {
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockSessionFindFirst.mockResolvedValue(mockSession());

    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
    } as any);

    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockSettingsFindFirst).not.toHaveBeenCalled();
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
