import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks: router client only. Real normalizeMac/isValidIpv4 are kept
// (pure functions) so MAC/IP validation is genuinely exercised.
// Prisma + sessions are mocked to PROVE the hard constraint: the guest
// path must never touch any person/tracking table.
// ---------------------------------------------------------------------------

const { mockFindHost, mockActiveLogin } = vi.hoisted(() => ({
  mockFindHost: vi.fn(),
  mockActiveLogin: vi.fn(),
}));

vi.mock("../../lib/mikrotik", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/mikrotik")>();
  return {
    ...actual,
    getMikrotik: () => ({
      findHost: mockFindHost,
      activeLogin: mockActiveLogin,
    }),
  };
});

const {
  mockVisitor,
  mockSession,
  mockEmployee,
  mockKnownDevice,
  mockAudit,
  mockNetSession,
  mockCheckIn,
} = vi.hoisted(() => ({
  mockVisitor: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  mockSession: { findFirst: vi.fn(), create: vi.fn() },
  mockEmployee: { findUnique: vi.fn() },
  mockKnownDevice: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockAudit: { create: vi.fn() },
  mockNetSession: { create: vi.fn(), updateMany: vi.fn() },
  mockCheckIn: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    visitor: mockVisitor,
    session: mockSession,
    employeeRoster: mockEmployee,
    knownDevice: mockKnownDevice,
    hotspotAudit: mockAudit,
    netSession: mockNetSession,
  },
}));

vi.mock("../sessions/service", () => ({
  sessionsService: { checkIn: mockCheckIn },
}));

import { integrationsService } from "./service";
import { guestQuickLoginSchema } from "./schema";
import { ApiError } from "../../lib/ApiError";

const MAC = "AA:BB:CC:DD:EE:FF";
const IP = "10.10.0.50";

function allTrackingMocks() {
  return [
    mockVisitor.findFirst,
    mockVisitor.create,
    mockVisitor.update,
    mockSession.findFirst,
    mockSession.create,
    mockEmployee.findUnique,
    mockKnownDevice.findMany,
    mockKnownDevice.findUnique,
    mockKnownDevice.findFirst,
    mockKnownDevice.count,
    mockKnownDevice.upsert,
    mockKnownDevice.update,
    mockKnownDevice.delete,
    mockAudit.create,
    mockNetSession.create,
    mockNetSession.updateMany,
    mockCheckIn,
  ];
}

function expectNoTrackingWrites() {
  for (const m of allTrackingMocks()) {
    expect(m).not.toHaveBeenCalled();
  }
}

async function expectApiError(
  promise: Promise<unknown>,
  statusCode: number,
  message?: string,
) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(statusCode);
    if (message !== undefined) expect((err as ApiError).message).toBe(message);
    return;
  }
  throw new Error(`Expected ApiError ${statusCode} but the call succeeded`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFindHost.mockResolvedValue({
    id: "h1",
    mac: MAC,
    address: IP,
    authorized: false,
    bypassed: false,
  });
  mockActiveLogin.mockResolvedValue(undefined);
});

describe("guestQuickLoginSchema", () => {
  it("accepts { code, mac, ip }", () => {
    const parsed = guestQuickLoginSchema.parse({ code: "500", mac: MAC, ip: IP });
    expect(parsed).toMatchObject({ code: "500", mac: MAC, ip: IP });
  });

  it("rejects missing code / malformed mac / malformed ip", () => {
    expect(() =>
      guestQuickLoginSchema.parse({ code: "", mac: MAC, ip: IP }),
    ).toThrow();
    expect(() =>
      guestQuickLoginSchema.parse({ code: "500", mac: "not-a-mac!!", ip: IP }),
    ).toThrow();
    expect(() =>
      guestQuickLoginSchema.parse({ code: "500", mac: MAC, ip: "not-an-ip" }),
    ).toThrow();
  });
});

describe("guestQuickLogin", () => {
  it("valid code authorizes the mac via activeLogin as code/code", async () => {
    const result = await integrationsService.guestQuickLogin({
      code: "500",
      mac: MAC,
      ip: IP,
    });

    expect(result).toEqual({ authorized: true, code: "500", mac: MAC, ip: IP });
    expect(mockActiveLogin).toHaveBeenCalledTimes(1);
    expect(mockActiveLogin).toHaveBeenCalledWith({
      user: "500",
      password: "500",
      ip: IP,
      mac: MAC,
    });
    expectNoTrackingWrites();
  });

  it("accepts every whitelisted code (100-500)", async () => {
    for (const code of ["100", "200", "300", "400", "500"]) {
      vi.resetAllMocks();
      mockFindHost.mockResolvedValue({ id: "h1", mac: MAC, address: IP });
      const result = await integrationsService.guestQuickLogin({
        code,
        mac: MAC,
        ip: IP,
      });
      expect(result.authorized).toBe(true);
      expect(mockActiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({ user: code, password: code }),
      );
    }
    expectNoTrackingWrites();
  });

  it("falls back to the Kiosk-forwarded ip when the host row has no address", async () => {
    mockFindHost.mockResolvedValue({ id: "h1", mac: MAC, address: "" });

    const result = await integrationsService.guestQuickLogin({
      code: "100",
      mac: "aa-bb-cc-dd-ee-ff",
      ip: "10.10.0.77",
    });

    expect(result).toEqual({
      authorized: true,
      code: "100",
      mac: MAC,
      ip: "10.10.0.77",
    });
    expect(mockActiveLogin).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "10.10.0.77" }),
    );
    expectNoTrackingWrites();
  });

  it("invalid code → 404 'الكود غير صحيح', router untouched", async () => {
    await expectApiError(
      integrationsService.guestQuickLogin({ code: "999", mac: MAC, ip: IP }),
      404,
      "الكود غير صحيح",
    );
    expect(mockFindHost).not.toHaveBeenCalled();
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expectNoTrackingWrites();
  });

  it("malformed MAC → 400", async () => {
    await expectApiError(
      integrationsService.guestQuickLogin({
        code: "500",
        mac: "ZZ-ZZ-ZZ-ZZ-ZZ-ZZ",
        ip: IP,
      }),
      400,
    );
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expectNoTrackingWrites();
  });

  it("unresolvable IP → 400", async () => {
    mockFindHost.mockResolvedValue({ id: "h1", mac: MAC, address: "" });
    await expectApiError(
      integrationsService.guestQuickLogin({
        code: "500",
        mac: MAC,
        ip: "999.999.999.999",
      }),
      400,
    );
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expectNoTrackingWrites();
  });

  it("off-network MAC (no host row) → 403, no login attempted", async () => {
    mockFindHost.mockResolvedValue(null);
    await expectApiError(
      integrationsService.guestQuickLogin({ code: "500", mac: MAC, ip: IP }),
      403,
    );
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expectNoTrackingWrites();
  });

  it("router activeLogin failure → 502 (never silent success)", async () => {
    mockActiveLogin.mockRejectedValueOnce(new Error("connection refused"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expectApiError(
        integrationsService.guestQuickLogin({ code: "500", mac: MAC, ip: IP }),
        502,
      );
    } finally {
      errSpy.mockRestore();
    }
    expectNoTrackingWrites();
  });

  it("router host lookup failure → 502", async () => {
    mockFindHost.mockRejectedValueOnce(new Error("timeout"));
    await expectApiError(
      integrationsService.guestQuickLogin({ code: "500", mac: MAC, ip: IP }),
      502,
    );
    expect(mockActiveLogin).not.toHaveBeenCalled();
    expectNoTrackingWrites();
  });
});
