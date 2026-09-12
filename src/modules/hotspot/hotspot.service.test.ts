import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listConnectedStaff,
} from "./hotspot.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `env.ts` reads process.env at module-load time, so HOTSPOT_USER_SECRET
// is captured before the test file's beforeEach runs. We set it in a
// hoisted block (which runs before all imports) to keep the hotspot
// service's `routerPasswordFor` happy.
vi.hoisted(() => {
  process.env.HOTSPOT_USER_SECRET = "test-secret-key-for-testing";
});

const {
  mockFindHost,
  mockEnsureUser,
  mockActiveLogin,
  mockFindIpByMac,
  mockGetHostname,
  mockLogoutUser,
  mockLogoutMac,
  mockSetUserDisabled,
} = vi.hoisted(() => ({
  mockFindHost: vi.fn(),
  mockEnsureUser: vi.fn(),
  mockActiveLogin: vi.fn(),
  mockFindIpByMac: vi.fn(),
  mockGetHostname: vi.fn(),
  mockLogoutUser: vi.fn(),
  mockLogoutMac: vi.fn(),
  mockSetUserDisabled: vi.fn(),
}));

vi.mock("../../lib/mikrotik", () => ({
  getMikrotik: () => ({
    findHost: mockFindHost,
    ensureUser: mockEnsureUser,
    activeLogin: mockActiveLogin,
    findIpByMac: mockFindIpByMac,
    getHostname: mockGetHostname,
    logoutUser: mockLogoutUser,
    logoutMac: mockLogoutMac,
    setUserDisabled: mockSetUserDisabled,
  }),
  normalizeMac: (raw: string) => {
    const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    return hex.match(/.{2}/g)!.join(":");
  },
}));

const {
  mockKnownDeviceFindUnique,
  mockKnownDeviceFindMany,
  mockKnownDeviceCount,
  mockKnownDeviceUpsert,
  mockKnownDeviceDelete,
  mockKnownDeviceFindFirst,
  mockNetSessionUpdateMany,
  mockNetSessionCreate,
  mockNetSessionFindFirst,
  mockNetSessionFindMany,
  mockNetSessionUpdate,
  mockSessionFindFirst,
  mockSessionFindUnique,
  mockSessionUpdate,
  mockVisitorFindFirst,
  mockVisitorCreate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockKnownDeviceFindUnique: vi.fn(),
  mockKnownDeviceFindMany: vi.fn(),
  mockKnownDeviceCount: vi.fn(),
  mockKnownDeviceUpsert: vi.fn(),
  mockKnownDeviceDelete: vi.fn(),
  mockKnownDeviceFindFirst: vi.fn(),
  mockNetSessionUpdateMany: vi.fn(),
  mockNetSessionCreate: vi.fn(),
  mockNetSessionFindFirst: vi.fn(),
  mockNetSessionFindMany: vi.fn(),
  mockNetSessionUpdate: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockSessionUpdate: vi.fn(),
  mockVisitorFindFirst: vi.fn(),
  mockVisitorCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    knownDevice: {
      findUnique: mockKnownDeviceFindUnique,
      findMany: mockKnownDeviceFindMany,
      count: mockKnownDeviceCount,
      upsert: mockKnownDeviceUpsert,
      delete: mockKnownDeviceDelete,
      findFirst: mockKnownDeviceFindFirst,
    },
    netSession: {
      updateMany: mockNetSessionUpdateMany,
      create: mockNetSessionCreate,
      findFirst: mockNetSessionFindFirst,
      findMany: mockNetSessionFindMany,
      update: mockNetSessionUpdate,
    },
    session: {
      findFirst: mockSessionFindFirst,
      findUnique: mockSessionFindUnique,
      update: mockSessionUpdate,
    },
    visitor: {
      findFirst: mockVisitorFindFirst,
      create: mockVisitorCreate,
    },
    hotspotAudit: { create: mockAuditCreate },
  },
}));

const { mockResolveIdentity, mockEnsureVisitor } = vi.hoisted(() => ({
  mockResolveIdentity: vi.fn(),
  mockEnsureVisitor: vi.fn(),
}));

vi.mock("./identity.service", () => ({
  resolveIdentity: (...args: any[]) => mockResolveIdentity(...args),
  ensureVisitor: (...args: any[]) => mockEnsureVisitor(...args),
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

import {
  getPortalContext,
  portalLogin,
  endByPhone,
  endOfDaySweep,
  computePendingInternetCharge,
  HotspotHttpError,
} from "./hotspot.service";
import { BILLING, LIMITS } from "./hotspot.config";
import { normalizePhone } from "./hotspot.config";
import { INTERNET_MAX_VISIT_MINUTES } from "../../lib/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAC = "AA:BB:CC:DD:EE:FF";
const IP = "10.10.0.50";
const PHONE = "0599123456";
const NAME = "Test User";

function mockIdentity(overrides: Record<string, any> = {}) {
  return {
    kind: "visitor" as const,
    phone: PHONE,
    name: NAME,
    visitorId: undefined,
    ...overrides,
  };
}

function mockHost(ip = IP) {
  return { id: "h1", mac: MAC, address: ip, authorized: false, bypassed: false };
}

function mockNetSession(id = "ns-001") {
  return { id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): wipes implementations AND the
  // mockResolvedValueOnce queue, so no state leaks between tests.
  // Every mock gets an explicit default below — no test may rely on
  // leftovers from a previous test.
  vi.resetAllMocks();

  // -- Router (mikrotik) --
  mockFindHost.mockResolvedValue(mockHost());
  mockEnsureUser.mockResolvedValue(undefined);
  mockActiveLogin.mockResolvedValue(undefined);
  mockFindIpByMac.mockResolvedValue(null);
  mockGetHostname.mockResolvedValue(null);
  mockLogoutUser.mockResolvedValue(1);
  mockLogoutMac.mockResolvedValue(undefined);
  mockSetUserDisabled.mockResolvedValue(undefined);

  // -- knownDevice --
  mockKnownDeviceFindUnique.mockResolvedValue(null);
  mockKnownDeviceFindMany.mockResolvedValue([]);
  mockKnownDeviceCount.mockResolvedValue(0);
  mockKnownDeviceUpsert.mockResolvedValue({});
  mockKnownDeviceDelete.mockResolvedValue({});
  mockKnownDeviceFindFirst.mockResolvedValue(null);

  // -- netSession --
  mockNetSessionUpdateMany.mockResolvedValue({ count: 0 });
  mockNetSessionCreate.mockResolvedValue(mockNetSession());
  mockNetSessionFindFirst.mockResolvedValue(null);
  mockNetSessionFindMany.mockResolvedValue([]);
  mockNetSessionUpdate.mockResolvedValue({});

  // -- session / visitor / audit --
  mockSessionFindFirst.mockResolvedValue(null);
  mockSessionFindUnique.mockResolvedValue(null);
  mockSessionUpdate.mockResolvedValue({});
  mockVisitorFindFirst.mockResolvedValue(null);
  mockVisitorCreate.mockResolvedValue({ id: "v-1" });
  mockAuditCreate.mockResolvedValue({});

  // -- identity / attendance --
  mockResolveIdentity.mockResolvedValue(mockIdentity({ visitorId: "v-1" }));
  mockEnsureVisitor.mockResolvedValue("v-1");
  mockCheckIn.mockResolvedValue({ id: "s-001", visitorId: "v-1" });

  // -- mutable billing config: restore defaults (tests may mutate) --
  BILLING.mode = "surcharge";
  LIMITS.maxVisitMinutes = INTERNET_MAX_VISIT_MINUTES;
});

describe("getPortalContext", () => {
  it("returns unknown context for unknown MAC", async () => {
    mockKnownDeviceFindUnique.mockResolvedValue(null);
    const ctx = await getPortalContext(MAC);
    expect(ctx.known).toBe(false);
    expect(ctx.choosable).toBe(true);
    expect(ctx.plans.length).toBe(3);
  });

  it("returns unknown for blocked device", async () => {
    mockKnownDeviceFindUnique.mockResolvedValue({
      mac: MAC,
      phone: PHONE,
      isBlocked: true,
    });
    const ctx = await getPortalContext(MAC);
    expect(ctx.known).toBe(false);
  });

  it("returns known context with visitor identity", async () => {
    mockKnownDeviceFindUnique.mockResolvedValue({
      mac: MAC,
      phone: PHONE,
      isBlocked: false,
    });
    mockResolveIdentity.mockResolvedValue(mockIdentity({ kind: "visitor" }));
    mockNetSessionFindFirst.mockResolvedValue(null);

    const ctx = await getPortalContext(MAC);
    expect(ctx.known).toBe(true);
    expect(ctx.phone).toBe(PHONE);
    expect(ctx.choosable).toBe(true);
  });

  it("returns member plans for subscriber (non-paid)", async () => {
    mockKnownDeviceFindUnique.mockResolvedValue({
      mac: MAC,
      phone: PHONE,
      isBlocked: false,
    });
    mockResolveIdentity.mockResolvedValue(
      mockIdentity({ kind: "subscriber", name: "Sub User" }),
    );
    mockNetSessionFindFirst.mockResolvedValue(null);

    const ctx = await getPortalContext(MAC);
    expect(ctx.known).toBe(true);
    expect(ctx.choosable).toBe(false);
    expect(ctx.plans.length).toBe(1);
    expect(ctx.plans[0].hourlyRate).toBe(0);
  });

  it("includes lastTier from previous session", async () => {
    mockKnownDeviceFindUnique.mockResolvedValue({
      mac: MAC,
      phone: PHONE,
      isBlocked: false,
    });
    mockResolveIdentity.mockResolvedValue(mockIdentity());
    mockNetSessionFindFirst.mockResolvedValue({ tier: "t30" });

    const ctx = await getPortalContext(MAC);
    expect(ctx.lastTier).toBe("t30");
  });
});

describe("portalLogin", () => {
  describe("new visitor + new device", () => {
    it("creates visitor, device, and net session", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(mockIdentity({ visitorId: undefined }));
      mockEnsureVisitor.mockResolvedValue("v-new");
      mockCheckIn.mockResolvedValue({ id: "s-001", visitorId: "v-new" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        name: NAME,
        tier: "t20",
      });

      expect(result.ok).toBe(true);
      expect(result.kind).toBe("visitor");
      expect(result.mbps).toBe(20);
      expect(result.hourlyRate).toBe(4);
      expect(result.netSessionId).toBe("ns-001");

      expect(mockEnsureVisitor).toHaveBeenCalledWith(PHONE, NAME);
      expect(mockCheckIn).toHaveBeenCalledWith({
        name: NAME,
        phone: PHONE,
        type: "visitor",
        source: "WIFI_PORTAL",
      });
      expect(mockKnownDeviceUpsert).toHaveBeenCalled();
      expect(mockNetSessionCreate).toHaveBeenCalled();
    });

    it("requires name for new visitor", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(mockIdentity({ visitorId: undefined }));

      await expect(
        portalLogin({ mac: MAC, ip: IP, phone: PHONE, name: "" }),
      ).rejects.toThrow(HotspotHttpError);
    });
  });

  describe("known visitor", () => {
    it("does not request name when visitor already exists", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-existing", name: "Known" }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-002", visitorId: "v-existing" });
      mockKnownDeviceFindUnique.mockResolvedValue({
        mac: MAC,
        phone: PHONE,
        isBlocked: false,
      });
      mockKnownDeviceCount.mockResolvedValue(1);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t10",
      });

      expect(result.ok).toBe(true);
      expect(result.name).toBe("Known");
      expect(mockEnsureVisitor).not.toHaveBeenCalled();
    });
  });

  describe("subscriber forced to noon-10m", () => {
    it("ignores tier=T30 and uses MEMBER_PLAN for subscriber", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({
          kind: "subscriber",
          visitorId: "v-sub",
          name: "Sub User",
        }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-003", visitorId: "v-sub" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t30",
      });

      expect(result.ok).toBe(true);
      expect(result.mbps).toBe(10);
      expect(result.hourlyRate).toBe(0);
      expect(result.kind).toBe("subscriber");

      // Verify the router profile is the member one, not visitor-30m
      const ensureUserCall = mockEnsureUser.mock.calls[0][0];
      expect(ensureUserCall.profile).toBe("noon-10m");
    });
  });

  describe("employee (staff) login", () => {
    it("staff with registered phone â†’ kind=employee, noon-10m, hourlyRate=0, no session/visitor/debt", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue({
        kind: "employee",
        phone: PHONE,
        name: "Staff Ahmad",
        staffId: "st-1",
        note: "Staff",
      });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t30", // even a requested paid tier must be ignored
      });

      expect(result.ok).toBe(true);
      expect(result.kind).toBe("employee");
      expect(result.mbps).toBe(10);
      expect(result.hourlyRate).toBe(0);

      // Router profile is the member one
      const ensureUserCall = mockEnsureUser.mock.calls[0][0];
      expect(ensureUserCall.profile).toBe("noon-10m");

      // No attendance session and no Visitor record â†’ no debt can ever be
      // created for staff (Session/Debt require a visitor).
      expect(mockCheckIn).not.toHaveBeenCalled();
      expect(mockEnsureVisitor).not.toHaveBeenCalled();
      expect(mockVisitorCreate).not.toHaveBeenCalled();

      // NetSession stands alone: no sessionId, no visitorId, zero rate
      expect(mockNetSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "employee",
            hourlyRate: 0,
            sessionId: undefined,
            visitorId: undefined,
          }),
        }),
      );
    });

    it("employee net session closes with amount=0 and no charge posted", async () => {
      const empStartedAt = new Date(Date.now() - 120 * 60_000);
      // Staff have no attendance session → computeVisitCharge reads only
      // the open row via netSession.findFirst.
      mockNetSessionFindFirst.mockResolvedValue({
        id: "ns-emp",
        kind: "employee",
        tier: "t10",
        hourlyRate: 0,
        sessionId: null,
        visitorId: null,
        startedAt: empStartedAt,
        endedAt: null,
        billed: false,
      });
      // No attendance session for staff.
      mockSessionFindFirst.mockResolvedValue(null);
      mockLogoutUser.mockResolvedValue(1);
      mockSetUserDisabled.mockResolvedValue(undefined);
      mockNetSessionUpdate.mockResolvedValue({});

      const result = await endByPhone(PHONE, "checkout");

      expect(result.ended).toBe(true);
      expect(result.amount).toBe(0);
      // billed=false (rate=0 â†’ billable=false), and no charge/label is
      // posted to any session.
      expect(mockNetSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 0, billed: false }),
        }),
      );
      // sessionId is null for staff, so neither the visit-anchor nor the
      // postCharge lookup is made.
      expect(mockSessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe("MAC not on network", () => {
    it("returns 403 when MAC is not in hotspot host", async () => {
      mockFindHost.mockResolvedValue(null);

      await expect(
        portalLogin({ mac: MAC, ip: IP, phone: PHONE, name: NAME }),
      ).rejects.toThrow(HotspotHttpError);

      try {
        await portalLogin({ mac: MAC, ip: IP, phone: PHONE, name: NAME });
      } catch (err) {
        expect((err as HotspotHttpError).status).toBe(403);
      }
    });
  });

  describe("router failure", () => {
    it("throws clean error when ensureUser fails", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(mockIdentity({ visitorId: "v-1" }));
      mockEnsureUser.mockRejectedValue(new Error("Router connection refused"));

      await expect(
        portalLogin({ mac: MAC, ip: IP, phone: PHONE, tier: "t10" }),
      ).rejects.toThrow("Router connection refused");
    });

    it("throws clean error when activeLogin fails", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(mockIdentity({ visitorId: "v-1" }));
      mockEnsureUser.mockResolvedValue(undefined);
      mockActiveLogin.mockRejectedValue(new Error("Login command failed"));

      await expect(
        portalLogin({ mac: MAC, ip: IP, phone: PHONE, tier: "t10" }),
      ).rejects.toThrow("Login command failed");
    });
  });

  describe("checkIn failure handling", () => {
    it("continues login when checkIn throws (open session exists)", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", name: "Existing" }),
      );
      mockCheckIn.mockRejectedValue(new Error("Visitor is already checked in"));
      mockSessionFindFirst.mockResolvedValue({ id: "s-open-001" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t10",
      });

      expect(result.ok).toBe(true);
      // sessionId should be linked to the existing open session
      expect(mockNetSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: "s-open-001" }),
        }),
      );
    });

    it("sets sessionId to undefined when no open session found", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-new", name: "Brand New" }),
      );
      mockCheckIn.mockRejectedValue(new Error("Visitor is already checked in"));
      mockSessionFindFirst.mockResolvedValue(null); // no open session
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t10",
      });

      expect(result.ok).toBe(true);
      expect(mockNetSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: undefined }),
        }),
      );
    });
  });

  describe("two known devices", () => {
    it("authorizes both extra devices for the same phone", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", name: "Multi" }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-004", visitorId: "v-1" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      // Two other known devices
      mockKnownDeviceFindMany.mockResolvedValue([
        { id: "d1", mac: "11:22:33:44:55:01", phone: PHONE, isBlocked: false },
        { id: "d2", mac: "11:22:33:44:55:02", phone: PHONE, isBlocked: false },
      ]);

      // Both devices have IPs
      mockFindIpByMac.mockImplementation(async (mac: string) => {
        if (mac === "11:22:33:44:55:01") return "10.10.0.51";
        if (mac === "11:22:33:44:55:02") return "10.10.0.52";
        return null;
      });

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t10",
      });

      expect(result.ok).toBe(true);
      expect(result.extraDevicesAuthorized).toBe(2);
      expect(mockActiveLogin).toHaveBeenCalledTimes(3); // 1 main + 2 extra
    });

    it("skips extra device that has no IP (not connected)", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", name: "Partial" }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-005", visitorId: "v-1" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      mockKnownDeviceFindMany.mockResolvedValue([
        { id: "d1", mac: "11:22:33:44:55:01", phone: PHONE, isBlocked: false },
        { id: "d2", mac: "11:22:33:44:55:02", phone: PHONE, isBlocked: false },
      ]);

      // Only first device has IP
      mockFindIpByMac.mockImplementation(async (mac: string) => {
        if (mac === "11:22:33:44:55:01") return "10.10.0.51";
        return null;
      });

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: PHONE,
        tier: "t10",
      });

      expect(result.extraDevicesAuthorized).toBe(1);
    });
  });

  describe("phone normalization", () => {
    it("normalizes international format before login", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", phone: PHONE }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-006", visitorId: "v-1" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      const result = await portalLogin({
        mac: MAC,
        ip: IP,
        phone: "970599123456",
        tier: "t10",
      });

      expect(result.ok).toBe(true);
      // The router user should be the normalized phone
      const ensureUserCall = mockEnsureUser.mock.calls[0][0];
      expect(ensureUserCall.name).toBe(PHONE);
    });

    it("rejects invalid phone", async () => {
      mockFindHost.mockResolvedValue(mockHost());

      await expect(
        portalLogin({ mac: MAC, ip: IP, phone: "123", tier: "t10" }),
      ).rejects.toThrow(HotspotHttpError);
    });
  });

  describe("previously open net session", () => {
    it("closes superseded sessions before creating new one", async () => {
      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", name: "Re" }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-007", visitorId: "v-1" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      await portalLogin({ mac: MAC, ip: IP, phone: PHONE, tier: "t10" });

      expect(mockNetSessionUpdateMany).toHaveBeenCalledWith({
        where: { phone: PHONE, endedAt: null },
        data: { endedAt: expect.any(Date), endedReason: "superseded" },
      });
    });

    it("uses real Prisma enum value for endedReason (not a string literal)", async () => {
      // Import the actual enum from @prisma/client to catch casing errors
      const { NetEndReason } = await import("@prisma/client");
      expect(NetEndReason.superseded).toBe("superseded");

      mockFindHost.mockResolvedValue(mockHost());
      mockResolveIdentity.mockResolvedValue(
        mockIdentity({ visitorId: "v-1", name: "Enum" }),
      );
      mockCheckIn.mockResolvedValue({ id: "s-008", visitorId: "v-1" });
      mockKnownDeviceFindUnique.mockResolvedValue(null);
      mockKnownDeviceCount.mockResolvedValue(0);

      await portalLogin({ mac: MAC, ip: IP, phone: PHONE, tier: "t10" });

      // Verify the real enum value was used, not a string literal
      expect(mockNetSessionUpdateMany).toHaveBeenCalledWith({
        where: { phone: PHONE, endedAt: null },
        data: { endedAt: expect.any(Date), endedReason: NetEndReason.superseded },
      });
    });
  });
});

// ---------------------------------------------------------------------------
// endByPhone + billing tests
// ---------------------------------------------------------------------------

describe("endByPhone", () => {
  const NETSESSION_ID = "ns-bill-001";
  const SESSION_ID = "s-bill-001";
  const PHONE_BILL = "0599111111";

  function makeOpenNetSession(overrides: Record<string, any> = {}) {
    return {
      id: NETSESSION_ID,
      phone: PHONE_BILL,
      name: "Bill User",
      kind: "visitor",
      tier: "t20",
      hourlyRate: 4,
      mac: "AA:BB:CC:DD:EE:FF",
      ip: "10.10.0.50",
      routerUser: PHONE_BILL,
      startedAt: new Date(Date.now() - 95 * 60_000), // 95 minutes ago
      endedAt: null,
      sessionId: SESSION_ID,
      visitorId: "v-bill",
      ...overrides,
    };
  }

  // Default: visit anchored at the open NetSession itself (no earlier
  // attendance session). Tests that need a different anchor override
  // this in their own body via mockSessionFindFirst.mockResolvedValueOnce.
  async function setupOpenOnly(open: any) {
    // computeVisitCharge now asks the prisma layer for an unbilled
    // NetSession (no endedAt filter). Mock the shape it expects.
    const row = {
      id: open.id,
      kind: open.kind,
      tier: open.tier,
      hourlyRate: open.hourlyRate,
      sessionId: open.sessionId,
      visitorId: open.visitorId,
      startedAt: open.startedAt,
      endedAt: open.endedAt ?? null,
      billed: false,
    };
    mockNetSessionFindMany.mockResolvedValue([row]);
    // No attendance session found â†’ anchor = the row's startedAt.
    mockSessionFindFirst.mockResolvedValue(null);
  }

  it("visitor 95 min on t20 (4 ILS/h) â†’ billable 105 â†’ 7.00 ILS", async () => {
    // 95 min raw â†’ computeAmount: min 60, ceil to 105 (increment 15) â†’ (105/60)*4 = 7.00
    const open = makeOpenNetSession();
    await setupOpenOnly(open);
    // Anchor visit at the open NetSession's start (no earlier session).
    mockSessionFindFirst.mockResolvedValue({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } }); // for the visit-anchor lookup
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      amount: 15,
      adjustmentNote: null,
    }); // for postCharge
    mockSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    expect(result.ended).toBe(true);
    expect(result.minutes).toBe(95); // raw minutes
    expect(result.amount).toBe(7); // billable amount
    expect(result.tier).toBe("t20");

    // NetSession closed
    expect(mockNetSessionUpdate).toHaveBeenCalledWith({
      where: { id: NETSESSION_ID },
      data: {
        endedAt: expect.any(Date),
        minutes: 95,
        amount: 7,
        endedReason: "checkout",
        billed: true,
      },
    });

    // Charge label posted to session (surcharge mode)
    // The actual amount (15 + 7 = 22) was already written by SessionsService.checkout
    // BEFORE endByPhone was called. postCharge ONLY writes the descriptive label.
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        adjustmentNote: "إنترنت 20 ميجا — 95 دقيقة",
      },
    });
  });

  it("visitor 12 min â†’ min 60 â†’ 4.00 ILS", async () => {
    // 12 min raw â†’ computeAmount: min 60 â†’ (60/60)*4 = 4.00
    const open = makeOpenNetSession({
      startedAt: new Date(Date.now() - 12 * 60_000),
    });
    await setupOpenOnly(open);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      amount: 10,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    expect(result.ended).toBe(true);
    expect(result.minutes).toBe(12); // raw minutes
    expect(result.amount).toBe(4); // billable (min 60)

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        adjustmentNote: "إنترنت 20 ميجا — 12 دقيقة",
      },
    });
  });

  it("subscriber â†’ 0 ILS, no charge posted", async () => {
    const open = makeOpenNetSession({
      kind: "subscriber",
      hourlyRate: 0,
      tier: "t10",
    });
    await setupOpenOnly(open);
    // The visit-anchor lookup IS made (sessionId is set), but the
    // subscriber's rate is 0, so no label is posted afterwards.
    mockSessionFindFirst.mockResolvedValue({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    expect(result.ended).toBe(true);
    expect(result.amount).toBe(0);

    // NetSession closed but no session charge
    expect(mockNetSessionUpdate).toHaveBeenCalled();
    // The visit-anchor lookup is now via session.findFirst (not findUnique).
    expect(mockSessionFindFirst).toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("no open session â†’ returns ended: false", async () => {
    mockNetSessionFindFirst.mockResolvedValue(null);
    mockNetSessionFindMany.mockResolvedValue([]);
    mockSessionFindUnique.mockResolvedValue(null);
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);

    const result = await endByPhone(PHONE_BILL, "checkout");

    expect(result.ended).toBe(false);
    expect(result.amount).toBe(0);
    expect(mockLogoutUser).toHaveBeenCalled();
  });

  it("router offline â†’ session still closed, error logged", async () => {
    const open = makeOpenNetSession();
    await setupOpenOnly(open);
    mockSessionFindFirst.mockResolvedValue({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockLogoutUser.mockRejectedValue(new Error("Connection refused"));
    mockNetSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    // Session is still closed even though router failed
    expect(result.ended).toBe(true);
    expect(result.minutes).toBe(95);
    expect(result.amount).toBe(7);

    expect(mockNetSessionUpdate).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LOGOUT",
          ok: false,
          detail: expect.stringContaining("Connection refused"),
        }),
      }),
    );
  });

  it("replaces mode â†’ internet fee replaces seat price", async () => {
    const originalMode = BILLING.mode;
    BILLING.mode = "replaces";

    const open = makeOpenNetSession();
    await setupOpenOnly(open);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      amount: 15,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    expect(result.amount).toBe(7);

    // In replaces mode: postCharge only writes the descriptive label.
    // The amount = internet fee was already stored by SessionsService.checkout,
    // and the seat was zeroed inside calculateSessionPricing.
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        adjustmentNote: "إنترنت 20 ميجا — 95 دقيقة",
      },
    });

    BILLING.mode = originalMode;
  });

  it("postCharge failure does not prevent session from closing", async () => {
    const open = makeOpenNetSession();
    await setupOpenOnly(open);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    // session.findUnique throws â€” simulates DB error in postCharge
    mockSessionFindUnique.mockRejectedValue(new Error("DB timeout"));
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});

    const result = await endByPhone(PHONE_BILL, "checkout");

    // NetSession is still closed
    expect(result.ended).toBe(true);
    expect(result.amount).toBe(7);
    expect(mockNetSessionUpdate).toHaveBeenCalled();

    // Audit logs the postCharge failure
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CHARGE",
          ok: false,
        }),
      }),
    );
  });

  it("writes the caller-supplied charge verbatim into the NetSession row (no recompute)", async () => {
    // Regression for the A9.x invoice/NetSession drift: sessions.checkout
    // computed the visit charge earlier and wrote it into session.amount.
    // endByPhone used to recompute minutes/amount from now, which could
    // land on a different rounding tick than the earlier read and make
    // the NetSession record disagree with the session invoice. Now
    // sessions.checkout passes its { amount, minutes, tier } through
    // opts.charge and endByPhone must use those numbers exactly.
    const open = makeOpenNetSession();
    await setupOpenOnly(open);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: open.startedAt, visitor: { phone: open.phone } });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      amount: 22,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});

    const callerCharge = { amount: 7.5, minutes: 180, tier: "t30" as const };
    const result = await endByPhone(PHONE_BILL, "checkout", { charge: callerCharge });

    // Result echoes the caller-supplied numbers.
    expect(result.amount).toBe(7.5);
    expect(result.minutes).toBe(180);
    expect(result.tier).toBe("t30");

    // NetSession row carries exactly those numbers â€” NOT the values
    // re-derived from `now âˆ’ open.startedAt`.
    expect(mockNetSessionUpdate).toHaveBeenCalledWith({
      where: { id: NETSESSION_ID },
      data: expect.objectContaining({
        minutes: 180,
        amount: 7.5,
        endedReason: "checkout",
        billed: true,
      }),
    });

    // The label posted to the attendance session also uses the caller
    // tier (t30, not the open net session's t20).
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { adjustmentNote: "إنترنت 30 ميجا — 180 دقيقة" },
    });
  });
});

// ---------------------------------------------------------------------------
// endOfDaySweep
// ---------------------------------------------------------------------------

describe("endOfDaySweep", () => {
  const PHONE_V1 = "+970599111222";
  const PHONE_V2 = "+970599333444";

  it("sweeps all open visitor sessions and audits success", async () => {
    // endOfDaySweep queries with kind: "visitor" filter, so DB returns only visitors
    mockNetSessionFindMany.mockResolvedValueOnce([
      { phone: PHONE_V1 },
      { phone: PHONE_V2 },
    ]);
    // Inside endByPhone: for each phone, the visit-level scan must find
    // an open NetSession. We use kind=visitor with hourlyRate=0 so the
    // amount is 0 (no charge) and the sweep keeps counting cleanly.
    mockNetSessionFindFirst.mockResolvedValue({
      id: "ns-eod",
      phone: PHONE_V1,
      kind: "visitor",
      tier: "t10",
      hourlyRate: 0,
      sessionId: null,
      visitorId: null,
    });
    mockNetSessionFindMany.mockResolvedValue([
      { startedAt: new Date(), tier: "t10", hourlyRate: 0 },
    ]);
    // endByPhone internally catches router errors â€” so even router failures
    // don't make it throw. It always succeeds (returns { ended: true/false }).
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionFindUnique.mockResolvedValue(null); // no attendance session â†’ no charge

    const result = await endOfDaySweep();

    expect(result.visitors).toBe(2);
    expect(result.errors).toBe(0);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "EOD_SWEEP",
          ok: true,
        }),
      }),
    );
  });

  it("counts errors when endByPhone throws (DB failure)", async () => {
    mockNetSessionFindMany.mockResolvedValueOnce([
      { phone: PHONE_V1 },
      { phone: PHONE_V2 },
    ]);
    // For each phone, the visit-level scan returns a single open row
    // (kind=visitor, hourlyRate=0 → billable=false, no postCharge).
    // No attendance session → the scan uses netSession.findFirst.
    mockNetSessionFindFirst.mockResolvedValue({
      id: "ns-eod",
      kind: "visitor",
      tier: "t10",
      hourlyRate: 0,
      sessionId: null,
      visitorId: null,
      startedAt: new Date(),
      endedAt: null,
      billed: false,
    });
    mockSessionFindFirst.mockResolvedValue(null); // no attendance session
    // First visitor: netSession.update throws â†’ endByPhone throws â†’ error counted
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate
      .mockRejectedValueOnce(new Error("DB connection lost"))
      .mockResolvedValueOnce({});

    const result = await endOfDaySweep();

    expect(result.visitors).toBe(2);
    expect(result.errors).toBe(1);
  });

  it("returns 0 visitors when no open sessions exist", async () => {
    mockNetSessionFindMany.mockResolvedValueOnce([]);

    const result = await endOfDaySweep();

    expect(result.visitors).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockLogoutUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// computePendingInternetCharge â€” visit-level billing
// ---------------------------------------------------------------------------

describe("computePendingInternetCharge (visit-level)", () => {
  const PHONE_VISIT = "0599222222";
  const SESSION_VISIT = "s-visit-1";

  // Build the visit scenario from the task:
  //   9:00 connect (t10 @ 3 ILS)
  //   11:00 disconnect (reconnect closes the old row as "superseded")
  //   11:40 reconnect (t10 @ 3 ILS)
  //   13:00 checkout  â†’ 4 hours total, ONE floor minimum
  function makeReconnectScenario() {
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const reconnectStart = new Date("2026-09-02T11:40:00Z");
    const now = new Date("2026-09-02T13:00:00Z");
    const open = {
      id: "ns-late",
      phone: PHONE_VISIT,
      kind: "visitor",
      tier: "t10",
      hourlyRate: 3,
      sessionId: SESSION_VISIT,
      visitorId: "v-visit",
      startedAt: reconnectStart,
      endedAt: null,
    };
    const visitRows = [
      { startedAt: firstStart, tier: "t10", hourlyRate: 3 },
      { startedAt: reconnectStart, tier: "t10", hourlyRate: 3 },
    ];
    return { open, visitRows, firstStart, now };
  }

  it("returns null when there is no open NetSession", async () => {
    mockNetSessionFindMany.mockResolvedValue([]);
    expect(await computePendingInternetCharge(PHONE_VISIT)).toBeNull();
  });

  it("uses the HIGHEST tier the visitor touched during the visit (anti-gaming)", async () => {
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const upgradeStart = new Date("2026-09-02T11:00:00Z");
    const now = new Date("2026-09-02T13:00:00Z");
    // The visitor started on t10 (3 ILS/h), upgraded to t30 (5 ILS/h) at 11:00.
    mockNetSessionFindMany.mockResolvedValue([
      {
        id: "ns-t10",
        phone: PHONE_VISIT,
        kind: "visitor",
        tier: "t10",
        hourlyRate: 3,
        sessionId: SESSION_VISIT,
        visitorId: "v-visit",
        startedAt: firstStart,
        endedAt: upgradeStart,
        billed: false,
      },
      {
        id: "ns-t30",
        phone: PHONE_VISIT,
        kind: "visitor",
        tier: "t30",
        hourlyRate: 5,
        sessionId: SESSION_VISIT,
        visitorId: "v-visit",
        startedAt: upgradeStart,
        endedAt: null,
        billed: false,
      },
    ]);
    mockSessionFindFirst.mockResolvedValue({
      id: "s-anchor",
      checkIn: firstStart,
      visitor: { phone: PHONE_VISIT },
    });

    vi.setSystemTime(now);
    try {
      const result = await computePendingInternetCharge(PHONE_VISIT);
      // Visit = 4h, but the highest tier ever touched was t30 (5 ILS/h).
      expect(result).toEqual({ amount: 20, minutes: 240, tier: "t30" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for subscribers (rate=0) regardless of duration", async () => {
    const start = new Date("2026-09-02T09:00:00Z");
    const now = new Date("2026-09-02T13:00:00Z");
    mockNetSessionFindMany.mockResolvedValue([
      {
        id: "ns-sub",
        phone: PHONE_VISIT,
        kind: "subscriber",
        tier: "t10",
        hourlyRate: 0,
        sessionId: SESSION_VISIT,
        visitorId: "v-sub",
        startedAt: start,
        endedAt: null,
        billed: false,
      },
    ]);
    mockSessionFindFirst.mockResolvedValue({
      id: "s-anchor",
      checkIn: start,
      visitor: { phone: PHONE_VISIT },
    });

    vi.setSystemTime(now);
    try {
      expect(await computePendingInternetCharge(PHONE_VISIT)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("for wifi-only users (no attendance session) uses the open NetSession", async () => {
    // 40 min on t20, 4 ILS/h → 40 < 60 floor → 4 ILS
    const start = new Date("2026-09-02T09:00:00Z");
    const now = new Date("2026-09-02T09:40:00Z");
    mockNetSessionFindFirst.mockResolvedValue({
      id: "ns-wifi",
      phone: PHONE_VISIT,
      kind: "visitor",
      tier: "t20",
      hourlyRate: 4,
      sessionId: null, // no attendance session
      visitorId: null,
      startedAt: start,
      endedAt: null,
      billed: false,
    });
    // No attendance session → only the open row.
    mockSessionFindFirst.mockResolvedValue(null);

    vi.setSystemTime(now);
    try {
      const result = await computePendingInternetCharge(PHONE_VISIT);
      expect(result).toEqual({ amount: 4, minutes: 40, tier: "t20" });
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// endByPhone bill flag â€” idle reconciliation must not bill
// ---------------------------------------------------------------------------

describe("visit-window anchor, idle reconciliation, and billing caps", () => {
  const PHONE = "0599444444";
  const NET = "ns-window";
  const SESSION = "s-window";

  // Build a fresh open NetSession for the visitor at `start`.
  function visitorRow(start: Date, overrides: Record<string, any> = {}) {
    return {
      id: NET,
      phone: PHONE,
      kind: "visitor",
      tier: "t20",
      hourlyRate: 4,
      sessionId: SESSION,
      visitorId: "v-window",
      startedAt: start,
      endedAt: null,
      billed: false,
      ...overrides,
    };
  }

  it("connects at 9:00, idle-reconciles at 13:10, then checks out at 13:30 â†’ bills 3.5h, not 0", async () => {
    // 9:00 connect, 12:10 idle disconnect (idle close must NOT eat the
    // floor), 12:30 checkout. Total visit 3.5h, billable (3.5 أ— 4 = 14
    // ILS). Without the redesign, the old session-level logic would
    // either (a) charge 0 because the "open row" anchor disappeared at
    // 13:10, or (b) double-bill because the idle close stamped
    // billed:true.
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const idleNow = new Date("2026-09-02T12:10:00Z");
    const checkoutNow = new Date("2026-09-02T12:30:00Z");

    // (1) Idle reconciliation at 12:10 â€” open row only, billed:false
    mockNetSessionFindMany.mockResolvedValueOnce([visitorRow(firstStart)]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockNetSessionFindFirst.mockResolvedValueOnce(visitorRow(firstStart));
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});

    vi.setSystemTime(idleNow);
    try {
      const idle = await endByPhone(PHONE, "idle", { bill: false });
      expect(idle.amount).toBe(0);
      expect(idle.ended).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // (2) Checkout at 12:30 â€” the row is still there with billed:false
    // (idle close left it alone) and endedAt set, endedReason:"idle".
    const closedRow = {
      ...visitorRow(firstStart),
      endedAt: new Date("2026-09-02T12:10:00Z"),
      endedReason: "idle",
      billed: false, // idle did not touch this
    };
    mockNetSessionFindMany.mockResolvedValueOnce([closedRow]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION,
      amount: 14,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});

    vi.setSystemTime(checkoutNow);
    try {
      const checkout = await endByPhone(PHONE, "checkout");
      // Visit 9:00â†’12:30 = 3.5h = 210 min. billable.
      // computeAmount(210, 4) = (210/60)*4 = 14.00 ILS
      expect(checkout.amount).toBe(14);
      expect(checkout.minutes).toBe(210);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checkoutUnpaid for the same scenario includes the internet fee in the debt", async () => {
    // The endByPhone path called from checkoutUnpaid must produce the
    // same 14 ILS â€” and the postCharge label must reach the session so
    // the debt record knows what to include.
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const closedRow = {
      ...visitorRow(firstStart),
      endedAt: new Date("2026-09-02T12:10:00Z"),
      endedReason: "idle",
      billed: false,
    };
    mockNetSessionFindMany.mockResolvedValueOnce([closedRow]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION,
      amount: 14,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});

    vi.setSystemTime(new Date("2026-09-02T12:30:00Z"));
    try {
      const result = await endByPhone(PHONE, "checkout");
      expect(result.amount).toBe(14);
      // The descriptive label reached the session â€” sessions.service
      // will read session.amount (14) and put it on the debt record.
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { adjustmentNote: expect.stringContaining("إنترنت 20 ميجا — 210 دقيقة") },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("a 7-day-old unbilled NetSession does NOT pull the visit backwards into the previous visit", async () => {
    // The ancient row belongs to a previous visit (different sessionId).
    // The new sessionId-based filter excludes it entirely — no clamping needed.
    const ancient = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const today = new Date();
    const todayStart = new Date(today.getTime() - 2 * 60 * 60_000); // 2h ago

    // Prisma filters by sessionId: the ancient row (sessionId: "s-previous-visit")
    // does NOT match the WHERE clause, so only the today row is returned.
    mockNetSessionFindMany.mockResolvedValueOnce([
      {
        id: "ns-today",
        phone: PHONE,
        kind: "visitor",
        tier: "t20",
        hourlyRate: 4,
        sessionId: SESSION, // matches attendance → included
        visitorId: "v-window",
        startedAt: todayStart,
        endedAt: null,
        billed: false,
      },
    ]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: todayStart, // today check-in
      visitor: { phone: PHONE },
    });

    const result = await computePendingInternetCharge(PHONE);
    // Only the today row qualifies. Visit = todayStart → now = 2h = 120 min,
    // (120/60)*4 = 8 ILS — NOT a week's worth of minutes.
    expect(result).toEqual({ amount: 8, minutes: 120, tier: "t20" });
  });

  it("old unbilled t30 row from a previous visit + today t10 → bills at t10, not t30", async () => {
    // The ancient row carries sessionId "s-prev" — Prisma excludes it.
    // Only the today row (t10 @ 3 ILS/h) qualifies. highestRate = 3, not 5.
    const todayStart = new Date("2026-09-02T09:00:00Z");
    const now = new Date("2026-09-02T11:00:00Z"); // 2h later
    mockNetSessionFindMany.mockResolvedValueOnce([
      {
        id: "ns-today",
        phone: PHONE,
        kind: "visitor",
        tier: "t10",
        hourlyRate: 3,
        sessionId: SESSION,
        visitorId: "v-window",
        startedAt: todayStart,
        endedAt: null,
        billed: false,
      },
    ]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: todayStart,
      visitor: { phone: PHONE },
    });

    vi.setSystemTime(now);
    try {
      const result = await computePendingInternetCharge(PHONE);
      // 2h @ 3 ILS/h = 6 ILS (tier t10, NOT t30).
      expect(result).toEqual({ amount: 6, minutes: 120, tier: "t10" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("connect at 8:58, checkIn at 9:00 (within tolerance) â†’ visit starts at 8:58", async () => {
    // Device beat reception by 2 minutes â€” well within the 30-minute
    // tolerance, so the anchor is 8:30 and the 8:58 row is inside.
    const start = new Date("2026-09-02T08:58:00Z");
    const checkIn = new Date("2026-09-02T09:00:00Z");
    const now = new Date("2026-09-02T10:00:00Z"); // checkout +1h later

    mockNetSessionFindMany.mockResolvedValueOnce([visitorRow(start)]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn,
      visitor: { phone: PHONE },
    });

    vi.setSystemTime(now);
    try {
      const result = await computePendingInternetCharge(PHONE);
      // 8:58 â†’ 10:00 = 62 min â†’ ceil to 75 (increment 15) â†’ (75/60)*4 = 5 ILS
      expect(result!.minutes).toBe(62);
      expect(result!.amount).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("connect at 8:00, checkIn at 9:00, row carries sessionId \u2192 visit starts at 8:00", async () => {
    // The row's sessionId matches the attendance session, so it qualifies
    // even though it started 60 minutes before checkIn. The sessionId
    // match overrides the tolerance window \u2014 the visit starts at 8:00.
    const start = new Date("2026-09-02T08:00:00Z");
    const checkIn = new Date("2026-09-02T09:00:00Z");
    const now = new Date("2026-09-02T10:00:00Z");

    mockNetSessionFindMany.mockResolvedValueOnce([visitorRow(start)]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn,
      visitor: { phone: PHONE },
    });

    vi.setSystemTime(now);
    try {
      const result = await computePendingInternetCharge(PHONE);
      // 8:00 \u2192 10:00 = 120 min, (120/60)*4 = 8.00 ILS.
      expect(result!.minutes).toBe(120);
      expect(result!.amount).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });


  it("two consecutive idle reconciliations followed by checkout â†’ still ONE floor minimum", async () => {
    // The visit must not double-bill. The floor (60 min) applies once.
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const idle1At = new Date("2026-09-02T10:00:00Z");
    const idle2At = new Date("2026-09-02T10:30:00Z");
    const checkoutAt = new Date("2026-09-02T11:00:00Z");

    // (1) First idle at 10:00 â€” open row only
    mockNetSessionFindMany.mockResolvedValueOnce([visitorRow(firstStart)]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockNetSessionFindFirst.mockResolvedValueOnce(visitorRow(firstStart));
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    vi.setSystemTime(idle1At);
    try { await endByPhone(PHONE, "idle", { bill: false }); } finally { vi.useRealTimers(); }

    // (2) Second idle at 10:30 â€” no rows left unbilled (the first idle
    // closed the only open row). endByPhone returns ended:false, and
    // importantly does NOT bill.
    mockNetSessionFindMany.mockResolvedValueOnce([]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    vi.setSystemTime(idle2At);
    try {
      const idle2 = await endByPhone(PHONE, "idle", { bill: false });
      expect(idle2.ended).toBe(false);
    } finally { vi.useRealTimers(); }

    // (3) Checkout at 11:00 â€” the row from 9:00 is still there, endedAt
    // set by the first idle, but billed:false.
    const closedRow = {
      ...visitorRow(firstStart),
      endedAt: idle1At,
      endedReason: "idle",
      billed: false,
    };
    mockNetSessionFindMany.mockResolvedValueOnce([closedRow]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: firstStart,
      visitor: { phone: PHONE },
    });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION,
      amount: 8,
      adjustmentNote: null,
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    mockSessionUpdate.mockResolvedValue({});
    vi.setSystemTime(checkoutAt);
    try {
      const checkout = await endByPhone(PHONE, "checkout");
      // 9:00â†’11:00 = 120 min أ— 4 = 8 ILS â€” ONE floor minimum, not three.
      expect(checkout.minutes).toBe(120);
      expect(checkout.amount).toBe(8);
    } finally { vi.useRealTimers(); }
  });

  it("subscriber: every step returns 0 and never posts a charge", async () => {
    const start = new Date("2026-09-02T09:00:00Z");
    const subRow = {
      ...visitorRow(start),
      kind: "subscriber",
      tier: "t10",
      hourlyRate: 0,
    };

    // idle recon
    mockNetSessionFindMany.mockResolvedValueOnce([subRow]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: start,
      visitor: { phone: PHONE },
    });
    mockNetSessionFindFirst.mockResolvedValueOnce(subRow);
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    try {
      const idle = await endByPhone(PHONE, "idle", { bill: false });
      expect(idle.amount).toBe(0);
      expect(idle.ended).toBe(true);
    } finally { vi.useRealTimers(); }

    // checkout
    const closedSub = { ...subRow, endedAt: new Date("2026-09-02T10:00:00Z"), endedReason: "idle", billed: false };
    mockNetSessionFindMany.mockResolvedValueOnce([closedSub]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: start,
      visitor: { phone: PHONE },
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    vi.setSystemTime(new Date("2026-09-02T13:00:00Z"));
    try {
      const checkout = await endByPhone(PHONE, "checkout");
      expect(checkout.amount).toBe(0);
      expect(checkout.ended).toBe(true);
      // No postCharge ever â€” subscribers pay nothing.
      expect(mockSessionUpdate).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("visit longer than maxVisitMinutes is capped and audited", async () => {
    // Override the cap to a truly different value (2h) — the top-level
    // beforeEach restores the env default before the next test.
    // A 5h visit (300 min raw) is capped to 120 min → (120/60)*4 = 8 ILS.
    LIMITS.maxVisitMinutes = 120;
    const start = new Date(Date.now() - 5 * 60 * 60_000);
    mockNetSessionFindMany.mockResolvedValueOnce([visitorRow(start)]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: SESSION,
      checkIn: start,
      visitor: { phone: PHONE },
    });

    const result = await computePendingInternetCharge(PHONE);
    // 5h raw would be 300 min. Capped to 120. (120/60)*4 = 8.00 ILS.
    expect(result!.minutes).toBe(120);
    expect(result!.amount).toBe(8);
    // The audit was written with the cap marker.
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VISIT_CAPPED",
          ok: true,
          phone: PHONE,
        }),
      }),
    );
  });
});

describe("endByPhone({ bill: false }) â€” idle reconciliation", () => {
  const PHONE_IDLE = "0599333333";
  const NETSESSION_IDLE = "ns-idle";
  const SESSION_IDLE = "s-idle";

  function makeOpen(overrides: Record<string, any> = {}) {
    return {
      id: NETSESSION_IDLE,
      phone: PHONE_IDLE,
      name: "Idle User",
      kind: "visitor",
      tier: "t20",
      hourlyRate: 4,
      mac: "AA:BB:CC:DD:EE:FF",
      ip: "10.10.0.50",
      routerUser: PHONE_IDLE,
      startedAt: new Date(Date.now() - 240 * 60_000), // 4h ago
      endedAt: null,
      sessionId: SESSION_IDLE,
      visitorId: "v-idle",
      ...overrides,
    };
  }

  it("closes ONLY the open NetSession, with amount=0 and minutes=null â€” leaves billed untouched", async () => {
    // Idle reconciliation: cut the router, close the open row WITHOUT
    // touching the `billed` column. billed means "charged", and idle
    // reconciliation does not charge. The superseded rows (closed at
    // reconnect time with endedReason:"superseded" and billed:false)
    // must stay untouched so the eventual checkout can still see them
    // and bill the whole visit end-to-end.
    const open = makeOpen();
    const row = {
      id: open.id,
      kind: open.kind,
      tier: open.tier,
      hourlyRate: open.hourlyRate,
      sessionId: open.sessionId,
      visitorId: open.visitorId,
      startedAt: open.startedAt,
      endedAt: open.endedAt ?? null,
      billed: false,
    };
    mockNetSessionFindMany.mockResolvedValue([row]);
    mockSessionFindFirst.mockResolvedValueOnce({
      id: "s-anchor",
      checkIn: open.startedAt,
      visitor: { phone: open.phone },
    });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});
    // The open-row lookup (only used when bill=false) finds the open
    // NetSession.
    mockNetSessionFindFirst.mockResolvedValueOnce(open);

    const result = await endByPhone(PHONE_IDLE, "idle", { bill: false });

    expect(result.ended).toBe(true);
    expect(result.minutes).toBe(0);
    expect(result.amount).toBe(0);
    expect(result.tier).toBe("t20");

    // ONLY the open row is touched. minutes:null, amount:0, and
    // `billed` is NOT in the data (left alone at its current value).
    expect(mockNetSessionUpdate).toHaveBeenCalledTimes(1);
    expect(mockNetSessionUpdate).toHaveBeenCalledWith({
      where: { id: NETSESSION_IDLE },
      data: {
        endedAt: expect.any(Date),
        endedReason: "idle",
      },
    });

    // No label posted to the attendance session
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("a subsequent checkout after a no-bill idle close still charges the WHOLE visit", async () => {
    // Scenario from the task:
    //   9:00 connect, 11:00 disconnect â†’ idle reconciliation closes at 11:00
    //   11:40 reconnect, 13:00 checkout
    //   Reconciliation must charge 0. Checkout must charge 12 ILS (4h أ— 3).
    const firstStart = new Date("2026-09-02T09:00:00Z");
    const reconnectStart = new Date("2026-09-02T11:40:00Z");
    const idleNow = new Date("2026-09-02T11:00:00Z");
    const checkoutNow = new Date("2026-09-02T13:00:00Z");
    const open = {
      id: NETSESSION_IDLE,
      phone: PHONE_IDLE,
      kind: "visitor",
      tier: "t10",
      hourlyRate: 3,
      sessionId: SESSION_IDLE,
      visitorId: "v-idle",
      startedAt: reconnectStart,
      endedAt: null,
    };
    const visitRows = [
      { startedAt: firstStart, tier: "t10", hourlyRate: 3 },
      { startedAt: reconnectStart, tier: "t10", hourlyRate: 3 },
    ];

    // -- (1) Idle reconciliation at 11:00 --
    // At 11:00 the open net session is the FIRST one (started 9:00).
    mockNetSessionFindFirst.mockResolvedValueOnce({
      ...open,
      startedAt: firstStart,
    });
    mockNetSessionFindMany.mockResolvedValueOnce([
      { startedAt: firstStart, tier: "t10", hourlyRate: 3 },
    ]);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: firstStart, visitor: { phone: "0599222222" } });
    mockLogoutUser.mockResolvedValue(1);
    mockSetUserDisabled.mockResolvedValue(undefined);
    mockNetSessionUpdate.mockResolvedValue({});

    vi.setSystemTime(idleNow);
    try {
      const idle = await endByPhone(PHONE_IDLE, "idle", { bill: false });
      // bill=false means "no charge". minutes/amount on the result
      // are 0 â€” billed is left untouched on the row so the eventual
      // checkout can still see the visit.
      expect(idle.amount).toBe(0);
      expect(idle.minutes).toBe(0);
    } finally {
      vi.useRealTimers();
    }

    // -- (2) Checkout at 13:00 (after the 11:40 reconnect) --
    mockNetSessionFindFirst.mockResolvedValueOnce(open);
    mockNetSessionFindMany.mockResolvedValueOnce(visitRows);
    mockSessionFindFirst.mockResolvedValueOnce({ id: "s-anchor", checkIn: firstStart, visitor: { phone: "0599222222" } });
    mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_IDLE,
      amount: 15,
      adjustmentNote: null,
    });

    vi.setSystemTime(checkoutNow);
    try {
      const checkout = await endByPhone(PHONE_IDLE, "checkout", { bill: true });
      // Whole visit: 4h أ— 3 ILS = 12 ILS â€” the idle close did NOT eat
      // a minimum of its own.
      expect(checkout.minutes).toBe(240);
      expect(checkout.amount).toBe(12);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// listConnectedStaff
// ---------------------------------------------------------------------------

describe("listConnectedStaff", () => {
  it("returns only open NetSessions with kind=employee", async () => {
    const rows = [
      {
        id: "ns-e1",
        phone: "0599111111",
        name: "Staff One",
        tier: "t10",
        mac: "AA:BB:CC:DD:EE:01",
        ip: "10.10.0.10",
        startedAt: new Date("2026-09-02T09:00:00Z"),
      },
    ];
    mockNetSessionFindMany.mockResolvedValue(rows);

    const result = await listConnectedStaff();

    expect(result).toEqual(rows);
    expect(mockNetSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ endedAt: null, kind: "employee" }),
        orderBy: { startedAt: "asc" },
      }),
    );
  });
});

