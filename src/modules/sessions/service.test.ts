import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockSessionFindUnique,
  mockSessionUpdate,
  mockSubscriptionFindFirst,
  mockSettingsFindFirst,
  mockDebtCreate,
  mockHotspotComputePendingInternetCharge,
  mockHotspotEndByPhone,
  mockBILLING,
} = vi.hoisted(() => ({
  mockSessionFindUnique: vi.fn(),
  mockSessionUpdate: vi.fn(),
  mockSubscriptionFindFirst: vi.fn(),
  mockSettingsFindFirst: vi.fn(),
  mockDebtCreate: vi.fn(),
  mockHotspotComputePendingInternetCharge: vi.fn(),
  mockHotspotEndByPhone: vi.fn(),
  mockBILLING: { mode: "surcharge" as "surcharge" | "replaces" },
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mockSessionFindUnique,
      update: mockSessionUpdate,
    },
    subscription: { findFirst: mockSubscriptionFindFirst },
    settings: { findFirst: mockSettingsFindFirst },
    debt: { create: mockDebtCreate },
  },
}));

vi.mock("../snack-wallet/service", () => ({
  snackWalletService: { refundSessionDeductions: vi.fn() },
}));

vi.mock("../hotspot/hotspot.service", () => ({
  computePendingInternetCharge: mockHotspotComputePendingInternetCharge,
  endByPhone: mockHotspotEndByPhone,
}));

vi.mock("../hotspot/hotspot.config", () => ({
  BILLING: mockBILLING,
  // Real tier rates (3/4/5) so the Anoon double-count guard can be tested.
  // Sessions with hourlyRate 5 + t20 internet (rate 4) must NOT trigger the
  // guard (rates differ) and keep classic surcharge behaviour (seat+internet).
  VISITOR_PLANS: [
    { tier: "t10", hourlyRate: 3 },
    { tier: "t20", hourlyRate: 4 },
    { tier: "t30", hourlyRate: 5 },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { sessionsService } from "./service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOURLY_RATE = 5;
const FULL_DAY_PRICE = 30;
const FULL_DAY_THRESHOLD_HOURS = 6;

function makeSettings() {
  return {
    hourlyRate: HOURLY_RATE,
    fullDayPrice: FULL_DAY_PRICE,
    fullDayThresholdHours: FULL_DAY_THRESHOLD_HOURS,
  };
}

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: "s-1",
    visitorId: "v-1",
    sessionType: "visitor",
    checkIn: new Date(Date.now() - 3 * 3600_000),
    checkOut: null,
    amount: 0,
    hourlyRate: HOURLY_RATE,
    paymentStatus: "full_debt",
    snackOrders: [],
    visitor: {
      id: "v-1",
      name: "Ahmad",
      phone: "0599111111",
      type: "visitor",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSettingsFindFirst.mockResolvedValue(makeSettings());
  mockSubscriptionFindFirst.mockResolvedValue(null);
  // mockSessionUpdate returns the data argument so result.* fields are populated.
  mockSessionUpdate.mockImplementation((args: any) =>
    Promise.resolve({
      id: args.where.id,
      visitorId: "v-1",
      sessionType: "visitor",
      checkIn: new Date(Date.now() - 3 * 3600_000),
      amount: args.data.amount ?? 0,
      finalPrice: args.data.finalPrice ?? null,
      calculatedPrice: args.data.calculatedPrice ?? null,
      paymentStatus: args.data.paymentStatus ?? "paid",
      paymentMethod: args.data.paymentMethod ?? null,
      snackOrders: [],
      visitor: {
        id: "v-1",
        name: "Ahmad",
        phone: "0599111111",
        type: "visitor",
      },
      ...args.data,
    }),
  );
  mockDebtCreate.mockResolvedValue({});
  mockHotspotEndByPhone.mockResolvedValue({
    ended: true,
    minutes: 95,
    amount: 7,
    tier: "t20",
  });
  mockBILLING.mode = "surcharge";
});

// ---------------------------------------------------------------------------
// 1) Visitor — 3h session + t20 95min internet
// ---------------------------------------------------------------------------

describe("checkout — visitor with internet charge (surcharge mode)", () => {
  it("includes internet fee in the collected amount (3h × 5 + 7 = 22)", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    // seat = 3h × 5 = 15, internet = 7, total = 22
    expect(result.amount).toBe(22);
    expect(result.finalPrice).toBe(22);
    expect(result.calculatedPrice).toBe(22);

    // The session.amount the employee collects MUST be the total the system already
    // would show — no surprise top-up from endByPhone afterwards.
    const updateCall = mockSessionUpdate.mock.calls[0][0];
    expect(updateCall.data.amount).toBe(22);
    expect(updateCall.data.finalPrice).toBe(22);

    // endByPhone still runs to cut internet, but the amount it returns is already in the total
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith("0599111111", "checkout", expect.objectContaining({ charge: expect.anything() }));

    // The internet charge is surfaced so the UI can show the breakdown.
    expect(result.internetCharge).toEqual({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });
  });

  it("stores the total as a single, atomic write — no late mutation by endByPhone", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    await sessionsService.checkout("s-1", "cash", 0, undefined, undefined, null, null);

    // Exactly one update — amount is 22 from the start. The bug was a SECOND
    // update from postCharge adding the internet fee on top of the seat.
    expect(mockSessionUpdate).toHaveBeenCalledTimes(1);
    expect(mockSessionUpdate.mock.calls[0][0].data.amount).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// 2) checkoutUnpaid — Debt must include the internet fee
// ---------------------------------------------------------------------------

describe("checkoutUnpaid — visitor with internet charge", () => {
  it("creates a Debt that includes the internet fee", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    const result = await sessionsService.checkoutUnpaid("s-1");

    // Total includes the internet fee the visitor will be billed for later.
    expect(result.amount).toBe(22);

    // The Debt record's amount must also include the internet fee.
    // BEFORE the fix: debtAmount = 15 (seat only), internet fee was lost.
    expect(mockDebtCreate).toHaveBeenCalledTimes(1);
    const debtArgs = mockDebtCreate.mock.calls[0][0];
    expect(debtArgs.data.amount).toBe(22);
    expect(debtArgs.data.type).toBe("session");
    expect(debtArgs.data.status).toBe("unpaid");
    expect(debtArgs.data.visitorId).toBe("v-1");
    expect(debtArgs.data.sessionId).toBe("s-1");

    // endByPhone still runs to cut the router even though we didn't take cash.
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith("0599111111", "checkout", expect.objectContaining({ charge: expect.anything() }));
  });

  it("records hoursPortion (debt - snacks - internet) so revenue splits correctly on collection", async () => {
    // Visitor 3h × 5 = 15 (seat), 5 (snacks), 7 (internet) → total 27.
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ snackOrders: [{ total: 5 }] }),
    );
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    await sessionsService.checkoutUnpaid("s-1");

    const debtArgs = mockDebtCreate.mock.calls[0][0];
    // total = 27; hoursPortion = 27 - 5 - 7 = 15
    expect(debtArgs.data.amount).toBe(27);
    expect(debtArgs.data.sessionAmount).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 3) Subscriber — no change to any amount
// ---------------------------------------------------------------------------

describe("checkout — subscriber (no internet billing)", () => {
  it("subscriber: no internet fee is added and time portion stays zero", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({
        sessionType: "subscriber",
        visitor: { id: "v-sub", name: "Sub", phone: "0599222222", type: "subscriber" },
      }),
    );
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      visitorId: "v-sub",
      status: "active",
      endDate: new Date(Date.now() + 30 * 86400_000),
      daysUsed: 1,
    });
    // Subscriber connects to WiFi → netSession exists but computeAmount returns 0
    // because MEMBER_PLAN.hourlyRate = 0, so computePendingInternetCharge returns null.
    mockHotspotComputePendingInternetCharge.mockResolvedValue(null);

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    expect(result.amount).toBe(0);
    expect(result.finalPrice).toBe(0);
    expect(result.internetCharge).toBeNull();

    const updateCall = mockSessionUpdate.mock.calls[0][0];
    expect(updateCall.data.amount).toBe(0);
    expect(updateCall.data.finalPrice).toBe(0);

    // Internet still gets cut (subscriber leaves the space), but no money changes hands.
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith("0599222222", "checkout", expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// 4) replaces mode — pricing zeros the seat inside calculateSessionPricing
// ---------------------------------------------------------------------------

describe("replaces mode — visitor internet fee replaces the seat price", () => {
  beforeEach(() => {
    mockBILLING.mode = "replaces";
  });

  it("session.amount equals the internet fee only (seat zeroed inside pricing)", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    // 3h × 5 would be 15 — but in "replaces" mode the seat is zeroed inside
    // calculateSessionPricing, so the total is just the internet fee.
    expect(result.amount).toBe(7);
    expect(result.finalPrice).toBe(7);

    const updateCall = mockSessionUpdate.mock.calls[0][0];
    expect(updateCall.data.amount).toBe(7);
    // The override field is persisted at 0 as a cosmetic marker.
    expect(updateCall.data.hourlyPriceOverride).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5) endByPhone is called after the write — it must NOT modify session.amount
// ---------------------------------------------------------------------------

describe("checkout — endByPhone runs AFTER the session write", () => {
  it("endByPhone is awaited but the amount it returns is not re-added to session.amount", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });

    await sessionsService.checkout("s-1", "cash", 0, undefined, undefined, null, null);

    // session.update is called exactly once — with the FULL amount (seat + internet).
    expect(mockSessionUpdate).toHaveBeenCalledTimes(1);

    // endByPhone is called once, after the update.
    expect(mockHotspotEndByPhone).toHaveBeenCalledTimes(1);
  });

  it("if endByPhone throws, the session amount is still correct (no rollback)", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: 7,
      minutes: 95,
      tier: "t20",
    });
    // endByPhone failure (router offline) must not undo the already-stored amount.
    mockHotspotEndByPhone.mockRejectedValue(new Error("Router offline"));

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    // The collected amount was already correct BEFORE endByPhone ran.
    expect(result.amount).toBe(22);
    expect(mockSessionUpdate.mock.calls[0][0].data.amount).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// 6) No open NetSession — internet charge is null, no error
// ---------------------------------------------------------------------------

describe("checkout — no active NetSession", () => {
  it("skips internet charge cleanly when visitor never connected to WiFi", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockHotspotComputePendingInternetCharge.mockResolvedValue(null);

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    // 3h × 5 = 15, no internet fee
    expect(result.amount).toBe(15);
    expect(result.internetCharge).toBeNull();
    // No net session → internetCharge was null, so endByPhone is called
    // with { charge: undefined } and re-derives from the visit (which is
    // empty, so the call is a no-op). Either way the second arg is fixed.
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith(
      "0599111111",
      "checkout",
      expect.objectContaining({}),
    );
  });
});

// ---------------------------------------------------------------------------
// 7) Anoon visitor — Session.hourlyRate already IS the tier rate.
// Regression test for the +3 ₪ bug: Session stored base+surcharge (6/7/8)
// and checkout added the NetSession visit charge AGAIN. After the fix,
// Session stores surcharge-only (3/4/5) and checkout must NOT add the
// internet amount a second time — Live and checkout both equal the tier
// rate per hour. Covers all 3 tiers end-to-end (check-in rate → checkout).
// ---------------------------------------------------------------------------

describe.each([
  { speed: "10M", tier: "t10", rate: 3 },
  { speed: "20M", tier: "t20", rate: 4 },
  { speed: "30M", tier: "t30", rate: 5 },
] as const)("checkout — Anoon visitor $speed (tier $tier, rate $rate)", ({ tier, rate }) => {
  it(`3h session at ${rate}₪/hr with ${tier} NetSession → total is time-only, no double internet`, async () => {
    // Anoon check-in stores surcharge-only in Session.hourlyRate.
    mockSessionFindUnique.mockResolvedValue(makeSession({ hourlyRate: rate }));
    // Visitor connected to WiFi on the same tier — visit charge exists,
    // but must be SKIPPED because the seat-time already covers it.
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: rate, // 60min × rate (min billing) — exact value irrelevant, must be ignored
      minutes: 60,
      tier,
    });

    const result = await sessionsService.checkout(
      "s-1",
      "cash",
      0,
      undefined,
      undefined,
      null,
      null,
    );

    // 3h × rate, NO extra internet on top.
    expect(result.amount).toBe(3 * rate);
    expect(result.finalPrice).toBe(3 * rate);
    expect(result.calculatedPrice).toBe(3 * rate);
    expect(result.internetCharge).toBeNull();

    const updateCall = mockSessionUpdate.mock.calls[0][0];
    expect(updateCall.data.amount).toBe(3 * rate);

    // NetSession closed WITHOUT a separate bill (avoids double-charge).
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith(
      "0599111111",
      "checkout",
      expect.objectContaining({ bill: false }),
    );
  });

  it(`checkoutUnpaid at ${rate}₪/hr → debt is time-only, no double internet`, async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ hourlyRate: rate }));
    mockHotspotComputePendingInternetCharge.mockResolvedValue({
      amount: rate,
      minutes: 60,
      tier,
    });

    const result = await sessionsService.checkoutUnpaid("s-1");

    expect(result.amount).toBe(3 * rate);
    expect(mockDebtCreate).toHaveBeenCalledTimes(1);
    expect(mockDebtCreate.mock.calls[0][0].data.amount).toBe(3 * rate);
    // hoursPortion = debt - snacks(0) - internet(0) = time-only.
    expect(mockDebtCreate.mock.calls[0][0].data.sessionAmount).toBe(3 * rate);
    expect(mockHotspotEndByPhone).toHaveBeenCalledWith(
      "0599111111",
      "checkout",
      expect.objectContaining({ bill: false }),
    );
  });
});
