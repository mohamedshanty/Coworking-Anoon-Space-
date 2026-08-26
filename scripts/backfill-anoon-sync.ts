import { prisma } from "../src/lib/prisma";
import { syncMemberToAnoonQr } from "../src/lib/anoon-sync";

const LIVE_DELAY_MS = 300;
const PHONE_PATTERN = /^\+?\d{9,15}$/;

type CurrentSubscriber = {
  visitorId: string;
  name: string;
  phone: string;
  packageType: string;
  startDate: Date;
};

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()+]/g, "");
}

function isPlausiblePhone(phone: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(phone));
}

async function getCurrentSubscribers(): Promise<CurrentSubscriber[]> {
  const now = new Date();

  const visitors = await prisma.visitor.findMany({
    where: {
      subscriptions: {
        some: {
          status: "active",
          endDate: { gte: now },
        },
      },
    },
    include: {
      subscriptions: {
        where: { status: "active", endDate: { gte: now } },
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return visitors.map((v) => {
    const activeSub = v.subscriptions[0];
    return {
      visitorId: v.id,
      name: v.name,
      phone: v.phone,
      packageType: activeSub?.packageType ?? "",
      startDate: activeSub?.startDate ?? new Date(0),
    };
  });
}

function findMalformed(subs: CurrentSubscriber[]) {
  return subs.filter((s) => !isPlausiblePhone(s.phone));
}

function findDuplicates(subs: CurrentSubscriber[]) {
  const byPhone = new Map<string, CurrentSubscriber[]>();
  for (const s of subs) {
    const key = normalizePhone(s.phone);
    const list = byPhone.get(key) ?? [];
    list.push(s);
    byPhone.set(key, list);
  }
  return [...byPhone.entries()].filter(([, list]) => list.length > 1);
}

function printReport(subs: CurrentSubscriber[]): void {
  const malformed = findMalformed(subs);
  const duplicates = findDuplicates(subs);

  console.log(`[Backfill] Current subscribers found: ${subs.length}`);
  console.log(
    `[Backfill] Malformed/missing phones: ${malformed.length}`
  );
  for (const s of malformed) {
    console.log(
      `  FLAG malformed phone=${JSON.stringify(s.phone)} name=${s.name} visitorId=${s.visitorId} planType=${s.packageType}`
    );
  }
  console.log(`[Backfill] Duplicate phones: ${duplicates.length}`);
  for (const [phone, list] of duplicates) {
    console.log(
      `  FLAG duplicate phone=${phone} x${list.length}: ${list
        .map((s) => `${s.name} (${s.visitorId})`)
        .join(", ")}`
    );
  }

  for (const s of subs) {
    console.log(
      `  - ${s.name} | phone=${s.phone} | planType=${s.packageType} | startDate=${s.startDate.toISOString()}`
    );
  }

  if (malformed.length > 0 || duplicates.length > 0) {
    console.log(
      `[Backfill] Review flagged records above before running with --live.`
    );
  }
}

async function runLive(subs: CurrentSubscriber[]): Promise<void> {
  const baseUrl = process.env.ANOON_QR_BASE_URL;
  const secret = process.env.INTERNAL_SYNC_SECRET;

  if (!baseUrl || !secret) {
    console.error(
      "[Backfill] Refusing to run --live: ANOON_QR_BASE_URL / INTERNAL_SYNC_SECRET are not configured in this environment."
    );
    process.exit(1);
  }

  const malformed = findMalformed(subs);
  if (malformed.length > 0) {
    console.warn(
      `[Backfill] WARNING: ${malformed.length} record(s) have malformed/missing phones and will still be attempted (they may fail on the Anoon QR side).`
    );
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    try {
      const outcome = await syncMemberToAnoonQr({
        name: s.name,
        phone: s.phone,
        packageType: s.packageType,
        startDate: s.startDate,
      });
      if (outcome.ok) {
        succeeded++;
      } else {
        failed++;
        console.error(
          `[Backfill] ${i + 1}/${subs.length} FAILED phone=${s.phone} reason=${outcome.reason ?? "unknown"}`
        );
      }
    } catch (error) {
      failed++;
      console.error(
        `[Backfill] ${i + 1}/${subs.length} UNEXPECTED-ERROR phone=${s.phone}:`,
        error
      );
    }

    if (i < subs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, LIVE_DELAY_MS));
    }
  }

  console.log(
    `[Backfill] Summary: attempted=${subs.length} succeeded=${succeeded} failed=${failed}`
  );
}

async function main() {
  const live = process.argv.slice(2).includes("--live");

  console.log(`[Backfill] Mode: ${live ? "LIVE" : "DRY RUN"}`);

  const subs = await getCurrentSubscribers();

  if (!live) {
    printReport(subs);
    console.log("[Backfill] Dry run complete — nothing was sent.");
  } else {
    printReport(subs);
    await runLive(subs);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Backfill] Fatal error:", error);
    process.exit(1);
  });
