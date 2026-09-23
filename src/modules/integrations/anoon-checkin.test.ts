import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (same style as hotspot.service.test.ts)
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.HOTSPOT_USER_SECRET = "test-secret-key-for-testing";
});

const {
  mockEnsureUser,
  mockEnsureProfileSharedUsers,
  mockFindHost,
  mockActiveLogin,
  mockFindIpByMac,
  mockGetHostname,
} = vi.hoisted(() => ({
  mockEnsureUser: vi.fn(),
  mockEnsureProfileSharedUsers: vi.fn(),
  mockFindHost: vi.fn(),
  mockActiveLogin: vi.fn(),
  mockFindIpByMac: vi.fn(),
  mockGetHostname: vi.fn(),
}));

function normalizeMacForTest(raw: string) {
  const hex = (raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) throw new Error(`Invalid MAC: ${raw}`);
  return hex.match(/.{2}/g)!.join(":");
}

function isValidIpv4ForTest(ip: string) {
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255)
  );
}

vi.mock("../../lib/mikrotik", () => ({
  getMikrotik: () => ({
    ensureUser: mockEnsureUser,
    ensureProfileSharedUsers: mockEnsureProfileSharedUsers,
    findHost: mockFindHost,
    activeLogin: mockActiveLogin,
    findIpByMac: mockFindIpByMac,
    getHostname: mockGetHostname,
  }),
  normalizeMac: normalizeMacForTest,
  isValidIpv4: isValidIpv4ForTest,
}));

const {
  mockVisitorFindFirst,
  mockVisitorCreate,
  mockEmployeeFindUnique,
  mockSessionFindFirst,
  mockSettingsFindFirst,
  mockKnownDeviceFindUnique,
  mockKnownDeviceFindMany,
  mockKnownDeviceFindFirst,
  mockKnownDeviceCount,
  mockKnownDeviceUpsert,
  mockKnownDeviceUpdate,
  mockKnownDeviceDelete,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockVisitorFindFirst: vi.fn(),
  mockVisitorCreate: vi.fn(),
  mockEmployeeFindUnique: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSettingsFindFirst: vi.fn(),
  mockKnownDeviceFindUnique: vi.fn(),
  mockKnownDeviceFindMany: vi.fn(),
  mockKnownDeviceFindFirst: vi.fn(),
  mockKnownDeviceCount: vi.fn(),
  mockKnownDeviceUpsert: vi.fn(),
  mockKnownDeviceUpdate: vi.fn(),
  mockKnownDeviceDelete: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: { findFirst: mockVisitorFindFirst, create: mockVisitorCreate },
    employeeRoster: { findUnique: mockEmployeeFindUnique },
    session: { findFirst: mockSessionFindFirst },
    settings: { findFirst: mockSettingsFindFirst },
    knownDevice: {
      findUnique: mockKnownDeviceFindUnique,
      findMany: mockKnownDeviceFindMany,
      findFirst: mockKnownDeviceFindFirst,
      count: mockKnownDeviceCount,
      upsert: mockKnownDeviceUpsert,
      update: mockKnownDeviceUpdate,
      delete: mockKnownDeviceDelete,
    },
    hotspotAudit: { create: mockAuditCreate },
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
  mockEnsureProfileSharedUsers.mockResolvedValue({ changed: false, previous: 4 });
  // Router device-auth defaults: on-network host, no known peers.
  mockFindHost.mockResolvedValue({
    id: "h1",
    mac: "AA:BB:CC:DD:EE:FF",
    address: "10.10.0.50",
    authorized: false,
    bypassed: false,
  });
  mockActiveLogin.mockResolvedValue(undefined);
  mockFindIpByMac.mockResolvedValue(null);
  mockGetHostname.mockResolvedValue(null);
  mockKnownDeviceFindUnique.mockResolvedValue(null);
  mockKnownDeviceFindMany.mockResolvedValue([]);
  mockKnownDeviceFindFirst.mockResolvedValue(null);
  mockKnownDeviceCount.mockResolvedValue(0);
  mockKnownDeviceUpsert.mockResolvedValue({});
  mockKnownDeviceUpdate.mockResolvedValue({});
  mockKnownDeviceDelete.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
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
          type: "employee",
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
// Hourly rate: visitor internet-tier rate ALONE (no base double-count).
// Regression test for the +3 ₪ bug where Session.hourlyRate was stored as
// base + surcharge (e.g. 10+4=14 for 20M) instead of surcharge-only (4),
// causing Live to show 6/7/8 instead of 3/4/5 and checkout to double-bill.
// ---------------------------------------------------------------------------

describe("hourly rate surcharge", () => {
  it("visitor 20M → Session hourlyRate = surcharge only (4), no base added", async () => {
    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "20M",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 4 }),
    );
  });

  it("visitor 10M → Session hourlyRate = surcharge only (3)", async () => {
    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 3 }),
    );
  });

  it("visitor 30M → Session hourlyRate = surcharge only (5)", async () => {
    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "30M",
    } as any);

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 5 }),
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

// ---------------------------------------------------------------------------
// Kiosk device authorization (optional mac/ip from the hotspot redirect)
// ---------------------------------------------------------------------------

describe("kiosk device authorization", () => {
  const MAC = "AA:BB:CC:DD:EE:FF";
  const HOST_IP = "10.10.0.50";

  it("schema accepts optional mac/ip (backward compatible when absent)", () => {
    const without = anoonCheckInSchema.parse({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
    });
    expect(without.mac).toBeUndefined();
    expect(without.ip).toBeUndefined();

    const withDevice = anoonCheckInSchema.parse({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      mac: MAC,
      ip: HOST_IP,
    });
    expect(withDevice.mac).toBe(MAC);
    expect(withDevice.ip).toBe(HOST_IP);
  });

  it("valid on-network mac → activeLogin + KnownDevice upsert, session still succeeds", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      mac: MAC,
      ip: "10.10.0.99", // router-observed host address wins over payload ip
    } as any);

    expect(result.session.id).toBe("s-001");
    expect(result.alreadyActive).toBe(false);
    expect(mockEnsureUser).toHaveBeenCalledTimes(1);
    expect(mockFindHost).toHaveBeenCalledWith(MAC);
    expect(mockActiveLogin).toHaveBeenCalledWith(
      expect.objectContaining({ user: "0590000000", ip: HOST_IP, mac: MAC }),
    );
    expect(mockKnownDeviceUpsert).toHaveBeenCalled();
  });

  it("payload ip is used when the host row has no address", async () => {
    mockFindHost.mockResolvedValue({
      id: "h1",
      mac: MAC,
      address: "",
      authorized: false,
      bypassed: false,
    });

    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      mac: MAC,
      ip: "10.10.0.77",
    } as any);

    expect(result.session.id).toBe("s-001");
    expect(mockActiveLogin).toHaveBeenCalledWith(
      expect.objectContaining({ user: "0590000000", ip: "10.10.0.77", mac: MAC }),
    );
  });

  it("no mac → identical to before (ensureUser only, no activeLogin/findHost)", async () => {
    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);

    expect(result.session.id).toBe("s-001");
    expect(mockEnsureUser).toHaveBeenCalledTimes(1);
    expect(mockFindHost).not.toHaveBeenCalled();
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expect(mockKnownDeviceUpsert).not.toHaveBeenCalled();
  });

  it("off-network mac → skipped gracefully, check-in still succeeds", async () => {
    mockFindHost.mockResolvedValue(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await integrationsService.anoonCheckIn({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        internetSpeed: "10M",
        mac: MAC,
        ip: HOST_IP,
      } as any);

      expect(result.session.id).toBe("s-001");
      expect(result.alreadyActive).toBe(false);
      expect(mockEnsureUser).toHaveBeenCalledTimes(1);
      expect(mockActiveLogin).not.toHaveBeenCalled();
      expect(mockKnownDeviceUpsert).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("malformed mac → skipped gracefully, check-in still succeeds", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      // NOTE: the schema intentionally accepts this (permissive strings) —
      // validation must never 400 on a bad mac; the service skips instead.
      const parsed = anoonCheckInSchema.parse({
        type: "visitor",
        name: "Test Visitor",
        phone: "0590000000",
        mac: "not-a-mac",
      });
      const result = await integrationsService.anoonCheckIn(parsed);

      expect(result.session.id).toBe("s-001");
      expect(mockEnsureUser).toHaveBeenCalledTimes(1);
      expect(mockActiveLogin).not.toHaveBeenCalled();
      expect(mockKnownDeviceUpsert).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("known peer on-network → re-authorized via the shared path", async () => {
    mockKnownDeviceFindMany.mockResolvedValue([
      { id: "d-laptop", mac: "11:22:33:44:55:66", phone: "0590000000" },
    ]);
    mockFindIpByMac.mockResolvedValue("10.10.0.60");

    await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      mac: MAC,
      ip: HOST_IP,
    } as any);

    // Current device + one known peer.
    expect(mockActiveLogin).toHaveBeenCalledTimes(2);
    expect(mockActiveLogin).toHaveBeenCalledWith(
      expect.objectContaining({ mac: "11:22:33:44:55:66", ip: "10.10.0.60" }),
    );
    expect(mockKnownDeviceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "d-laptop" }) }),
    );
  });

  // Regression: phone checks in (new session) → laptop checks in with the
  // SAME name+phone while the session is still open. Before the fix, the
  // idempotent early-return skipped router provisioning entirely, so the
  // laptop got a success-looking alreadyActive:true response yet never
  // received internet — and no LOGIN audit row was written, which is why
  // the production HotspotAudit showed zero failed LOGINs for this bug.
  it("second device while session open → laptop authorized, alreadyActive:true, LOGIN audited", async () => {
    const LAPTOP_MAC = "11:22:33:44:55:66";
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockSessionFindFirst
      .mockResolvedValueOnce(null) // phone: no open session → creates one
      .mockResolvedValue(mockSession()); // laptop: session already open
    mockFindHost.mockImplementation((mac: string) =>
      Promise.resolve({
        id: `h-${mac}`,
        mac,
        address: mac === LAPTOP_MAC ? "10.10.0.60" : HOST_IP,
        authorized: false,
        bypassed: false,
      }),
    );

    const first = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      mac: MAC,
      ip: HOST_IP,
    } as any);
    expect(first.alreadyActive).toBe(false);

    const second = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
      mac: LAPTOP_MAC,
      ip: "10.10.0.60",
    } as any);

    expect(second.alreadyActive).toBe(true);
    expect(second.session.id).toBe("s-001");
    // No second attendance session…
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
    // …but the laptop MAC got its own router login…
    expect(mockActiveLogin).toHaveBeenCalledWith(
      expect.objectContaining({ user: "0590000000", ip: "10.10.0.60", mac: LAPTOP_MAC }),
    );
    expect(mockKnownDeviceUpsert).toHaveBeenCalled();
    // …with an audit trail proving the attempt reached the router.
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "LOGIN", ok: true, mac: LAPTOP_MAC }),
      }),
    );
  });

  it("mac-less replay of an open session still skips the router entirely", async () => {
    mockVisitorFindFirst.mockResolvedValue(mockVisitor());
    mockSessionFindFirst.mockResolvedValue(mockSession());

    const result = await integrationsService.anoonCheckIn({
      type: "visitor",
      name: "Test Visitor",
      phone: "0590000000",
      internetSpeed: "10M",
    } as any);

    expect(result.alreadyActive).toBe(true);
    expect(mockEnsureUser).not.toHaveBeenCalled();
    expect(mockActiveLogin).not.toHaveBeenCalled();
  });
});
