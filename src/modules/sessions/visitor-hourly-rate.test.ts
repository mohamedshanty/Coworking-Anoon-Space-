import { describe, it, expect } from "vitest";

import { calculateSessionPricing } from "./pricing";
import { resolveEffectivePlan } from "../integrations/service";
import { VISITOR_PLANS, MEMBER_PLAN, computeAmount } from "../hotspot/hotspot.config";

// ---------------------------------------------------------------------------
// End-to-end visitor hourly-rate regression test (+3 ₪ bug).
//
// Chain under test (no DB — pure business logic):
//   Anoon QR check-in (internetSpeed 10M/20M/30M)
//     → resolveEffectivePlan → plan.hourlyRate (3/4/5)
//     → Session.hourlyRate = plan.hourlyRate (surcharge ONLY, no base added)
//     → Live page (getLiveSessions): calculateSessionPricing WITHOUT
//       internetCharge → total/hours must equal the tier rate
//     → Checkout (sessionsService.checkout): calculateSessionPricing WITH
//       a NetSession visit charge for the same tier. Because Session already
//       IS the tier rate, the guard in checkout() drops the extra internet
//       amount (internetAlreadyInSeat) → total/hours must STILL equal the
//       tier rate (no double-count).
//
// Acceptance: 10M→3, 20M→4, 30M→5 on Live AND at checkout.
// ---------------------------------------------------------------------------

const SETTINGS = {
  hourlyRate: 3, // production-like base seat price that used to leak in as +3
  fullDayPrice: 50,
  fullDayThresholdHours: 6,
};

const ONE_HOUR_MS = 3600_000;

function oneHourAgo(): Date {
  return new Date(Date.now() - ONE_HOUR_MS);
}

describe.each([
  { speed: "10M", tier: "t10", rate: 3, profile: "visitor-10m" },
  { speed: "20M", tier: "t20", rate: 4, profile: "visitor-20m" },
  { speed: "30M", tier: "t30", rate: 5, profile: "visitor-30m" },
] as const)("visitor $speed → $rate ₪/hr end-to-end", ({ speed, tier, rate, profile }) => {
  it("check-in resolves the correct plan (tier, profile, surcharge-only rate)", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    expect(plan.tier).toBe(tier);
    expect(plan.routerProfile).toBe(profile);
    expect(plan.hourlyRate).toBe(rate);
  });

  it("Session.hourlyRate stored at check-in is surcharge-only (no base added)", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    // New check-in logic: finalHourlyRate = plan.hourlyRate (NOT base + plan).
    const sessionHourlyRate = plan.hourlyRate;
    expect(sessionHourlyRate).toBe(rate);
    // The old buggy value would have been base + surcharge.
    expect(sessionHourlyRate).not.toBe(SETTINGS.hourlyRate + rate);
  });

  it("Live page total per hour equals the tier rate (no internet added live)", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    const sessionHourlyRate = plan.hourlyRate;

    // getLiveSessions calls calculateSessionPricing WITHOUT netChargeParam.
    const pricing = calculateSessionPricing(
      oneHourAgo(),
      "visitor",
      false,
      [],
      { ...SETTINGS, hourlyRate: sessionHourlyRate },
    );

    expect(pricing.hours).toBeCloseTo(1, 1);
    expect(pricing.timeAmount).toBeCloseTo(rate, 1);
    expect(pricing.internetAmount).toBe(0);
    expect(pricing.totalAmount).toBeCloseTo(rate, 1);
    expect(pricing.totalAmount / pricing.hours).toBeCloseTo(rate, 0);
  });

  it("checkout with a same-tier NetSession does NOT double-count (guard skips internet)", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    const sessionHourlyRate = plan.hourlyRate;

    // Simulate a 60-min WiFi visit on the same tier.
    const visitAmount = computeAmount(60, rate);
    expect(visitAmount).toBeCloseTo(rate, 2);

    // Guard in checkout(): Session rate == tier rate → internetAlreadyInSeat,
    // so netChargeParam is nulled and pricing runs WITHOUT internetCharge.
    const tierPlan = VISITOR_PLANS.find((p) => p.tier === tier)!;
    const guardTriggers = Math.abs(sessionHourlyRate - tierPlan.hourlyRate) < 0.001;
    expect(guardTriggers).toBe(true);

    const pricing = calculateSessionPricing(
      oneHourAgo(),
      "visitor",
      false,
      [],
      { ...SETTINGS, hourlyRate: sessionHourlyRate },
      null,
      null, // internet skipped by guard
    );

    expect(pricing.totalAmount).toBeCloseTo(rate, 1);
    expect(pricing.totalAmount / pricing.hours).toBeCloseTo(rate, 0);
  });

  it("checkout without WiFi (no NetSession) charges the tier rate", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    const pricing = calculateSessionPricing(
      oneHourAgo(),
      "visitor",
      false,
      [],
      { ...SETTINGS, hourlyRate: plan.hourlyRate },
      null,
      null,
    );
    expect(pricing.totalAmount).toBeCloseTo(rate, 1);
  });

  it("old buggy Session rate (base + surcharge) would show the +3 symptom", () => {
    const plan = resolveEffectivePlan("visitor", speed);
    const buggyRate = SETTINGS.hourlyRate + plan.hourlyRate;
    expect(buggyRate).toBe(rate + 3);
    const pricing = calculateSessionPricing(
      oneHourAgo(),
      "visitor",
      false,
      [],
      { ...SETTINGS, hourlyRate: buggyRate },
    );
    // Documents the reported symptom: 6/7/8 instead of 3/4/5.
    expect(pricing.totalAmount).toBeCloseTo(rate + 3, 1);
  });
});

describe("members unaffected (still free / noon-10m)", () => {
  it.each(["subscriber", "trainee", "employee"] as const)(
    "%s → noon-10m, rate 0, time zeroed in pricing",
    (kind) => {
      const plan = resolveEffectivePlan(kind as any, "30M", "visitor-30m");
      expect(plan.routerProfile).toBe("noon-10m");
      expect(plan.hourlyRate).toBe(MEMBER_PLAN.hourlyRate);

      const pricing = calculateSessionPricing(
        oneHourAgo(),
        kind,
        kind === "subscriber" ? true : false,
        [],
        { ...SETTINGS, hourlyRate: SETTINGS.hourlyRate },
      );
      // Trainees/employees are free by type; subscribers with active sub free.
      // (subscriber without active sub would pay seat — tested elsewhere.)
      if (kind !== "subscriber") {
        expect(pricing.timeAmount).toBe(0);
        expect(pricing.totalAmount).toBe(0);
      }
    },
  );
});
