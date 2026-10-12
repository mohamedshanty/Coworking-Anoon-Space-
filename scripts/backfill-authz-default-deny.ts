/**
 * README — READ BEFORE RUNNING
 *
 * 1. Run this backfill BEFORE deploying the new default-deny authorize()
 *    middleware. The new middleware denies when no Permission row exists;
 *    without this backfill, existing non-admin staff would be locked out.
 * 2. Backend + frontend must be deployed together. The frontend can() mirror
 *    and PAGE_KEYS remap assume the same 19 Arabic pageKeys as the backend.
 *    Deploying only one side leaves the UI and API out of agreement.
 *
 * Policy (approved):
 * - For every existing non-admin staff x every one of the 19 keys, create
 *   MISSING rows as canView=true, canEdit=true, canDelete=true (preserves
 *   today's effective allow behavior). Never downgrade existing rows.
 * - Never touch admin rows (admins bypass authorize()).
 * - Never delete rows. English-slug rows from the old Settings UI
 *   (live, inventory, ...) are dead weight under both old and new code;
 *   they are reported, not deleted.
 * - New staff created after the fix get no rows (deny-by-default).
 *
 * Usage (operator runs this, agents do not):
 *   npx tsx scripts/backfill-authz-default-deny.ts            # dry-run (default)
 *   CONFIRM=yes npx tsx scripts/backfill-authz-default-deny.ts --apply   # writes
 */

import { prisma } from "../src/lib/prisma";

const ALL_19_KEYS = [
  "الرئيسية",
  "داخل المساحة",
  "السجل",
  "المشتركون",
  "السناكس",
  "المشروبات",
  "المخزون",
  "المصروفات",
  "المديونيات",
  "القاعات",
  "الدورات",
  "المتابعة",
  "التقارير",
  "الإعدادات",
  "جهات الاتصال",
  "الموظفون",
  "المتدربون",
  "طلبة تمكين",
  "محفظة السناكس",
];

const OLD_ENGLISH_SLUGS = [
  "live",
  "inventory",
  "expenses",
  "debts",
  "rooms",
  "snacks",
  "hot-drinks",
  "follow-up",
  "courses",
  "subscribers",
  "trainees",
  "history",
  "reports",
  "settings",
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.CONFIRM !== "yes") {
    console.error('Refusing to apply without CONFIRM=yes. Re-run with CONFIRM=yes ... --apply');
    process.exit(1);
  }
  console.log(apply ? "MODE: APPLY (writes missing rows)" : "MODE: DRY-RUN (no writes)");

  const staff = await prisma.staff.findMany({
    where: { role: { not: "admin" } },
    select: { id: true, username: true, name: true, role: true },
    orderBy: { username: "asc" },
  });
  console.log(`Non-admin staff: ${staff.length}`);

  let wouldCreate = 0;
  const wouldRestrict: Array<{ staffId: string; username: string; pageKey: string }> = [];
  const englishRows: Array<{ staffId: string; username: string; pageKey: string }> = [];

  for (const s of staff) {
    const existing = await prisma.permission.findMany({
      where: { staffId: s.id },
      select: { pageKey: true, canView: true, canEdit: true, canDelete: true },
    });
    const byKey = new Map(existing.map((p) => [p.pageKey, p]));

    for (const p of existing) {
      if (OLD_ENGLISH_SLUGS.includes(p.pageKey)) {
        englishRows.push({ staffId: s.id, username: s.username, pageKey: p.pageKey });
      }
      if (ALL_19_KEYS.includes(p.pageKey) && p.canView && (!p.canEdit || !p.canDelete)) {
        wouldRestrict.push({ staffId: s.id, username: s.username, pageKey: p.pageKey });
      }
    }

    const missing = ALL_19_KEYS.filter((k) => !byKey.has(k));
    console.log(`- ${s.username} (${s.id}): ${existing.length} rows, ${missing.length} missing -> ${missing.join(" | ") || "(none)"}`);
    wouldCreate += missing.length;

    if (apply && missing.length > 0) {
      await prisma.permission.createMany({
        data: missing.map((pageKey) => ({
          staffId: s.id,
          pageKey,
          canView: true,
          canEdit: true,
          canDelete: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`\nWould create ${wouldCreate} rows (true/true/true, missing only).`);
  console.log(
    `Existing restrictive rows that will deny edit/delete after deploy: ${wouldRestrict.length}`,
  );
  for (const r of wouldRestrict.slice(0, 50)) {
    console.log(`  restrict: ${r.username} ${r.pageKey}`);
  }
  if (wouldRestrict.length > 50) console.log(`  ... and ${wouldRestrict.length - 50} more`);
  console.log(`Old English-slug rows found (kept, not deleted): ${englishRows.length}`);
  for (const r of englishRows.slice(0, 50)) {
    console.log(`  english-slug: ${r.username} ${r.pageKey}`);
  }
  if (englishRows.length > 50) console.log(`  ... and ${englishRows.length - 50} more`);

  if (!apply) {
    console.log("\nDry-run complete. No writes performed.");
    console.log("To apply: CONFIRM=yes npx tsx scripts/backfill-authz-default-deny.ts --apply");
  } else {
    console.log("\nApply complete.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
