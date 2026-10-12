import { prisma } from "./prisma";
import { ApiError } from "./ApiError";

/**
 * Transactional person merge: mergePerson(sourceId → targetId).
 *
 * Re-links ALL children of the source person to the target person, then
 * archives the source row (soft delete — never a hard delete):
 *   - Session (sessionType untouched → historical type preserved)
 *   - Subscription (ids unchanged, so linked Debt.subscriptionId stay valid)
 *   - VisitorNote, Debt (visitorId + name/phone snapshot synced to target),
 *     NetSession
 *   - Sale.linkedName for sales of moved sessions (when names differ)
 *   - SnackWallet keyed by phone (moved to the target phone with clash check)
 *
 * Guards: refuses when either person has an active (checked-in) session, and
 * when the target itself is archived. Idempotent: re-running on an already
 * archived, fully-moved source returns a noop summary.
 *
 * With { dryRun: true } it performs the same loads/guards/counts but writes
 * nothing — used for pre-apply reports.
 */

export interface MergeMovedCounts {
  sessions: number;
  subscriptions: number;
  visitorNotes: number;
  debts: number;
  netSessions: number;
  sales: number;
  walletMoved: boolean;
}

export interface MergeSummary {
  sourceId: string;
  targetId: string;
  source: { name: string; phone: string; type: string };
  target: { name: string; phone: string; type: string };
  moved: MergeMovedCounts;
  sourceArchivedAt: string | null;
  noop?: boolean;
  dryRun?: boolean;
}

export async function mergePerson(
  sourceId: string,
  targetId: string,
  opts: { dryRun?: boolean } = {},
): Promise<MergeSummary> {
  const dryRun = opts.dryRun === true;

  if (sourceId === targetId) {
    throw new ApiError(400, "لا يمكن دمج الشخص مع نفسه");
  }

  const [source, target] = await Promise.all([
    prisma.visitor.findUnique({ where: { id: sourceId } }),
    prisma.visitor.findUnique({ where: { id: targetId } }),
  ]);
  if (!source) throw new ApiError(404, "السجل المصدر غير موجود");
  if (!target) throw new ApiError(404, "السجل الهدف غير موجود");
  if ((target as any).deletedAt) {
    throw new ApiError(400, "السجل الهدف مؤرشف — استعده أولاً قبل الدمج فيه");
  }

  // Active-session guard on both sides (checked-in people are never moved).
  const activeSession = await prisma.session.findFirst({
    where: { visitorId: { in: [sourceId, targetId] }, checkOut: null },
    select: { id: true, visitorId: true },
  });
  if (activeSession) {
    const who = activeSession.visitorId === sourceId ? "المصدر" : "الهدف";
    throw new ApiError(400, `لا يمكن الدمج — الشخص (${who}) لديه جلسة نشطة`);
  }

  const [sessions, subscriptions, visitorNotes, debts, netSessions] = await Promise.all([
    prisma.session.findMany({ where: { visitorId: sourceId }, select: { id: true } }),
    prisma.subscription.findMany({ where: { visitorId: sourceId }, select: { id: true } }),
    prisma.visitorNote.findMany({ where: { visitorId: sourceId }, select: { id: true } }),
    prisma.debt.findMany({ where: { visitorId: sourceId }, select: { id: true } }),
    prisma.netSession.findMany({ where: { visitorId: sourceId }, select: { id: true } }),
  ]);
  const sessionIds = sessions.map((s) => s.id);
  const sales =
    sessionIds.length > 0
      ? await prisma.sale.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })
      : [];

  const sourceWallet =
    source.phone !== target.phone
      ? await prisma.snackWallet.findUnique({ where: { phone: source.phone }, select: { id: true } })
      : null;

  const moved: MergeMovedCounts = {
    sessions: sessions.length,
    subscriptions: subscriptions.length,
    visitorNotes: visitorNotes.length,
    debts: debts.length,
    netSessions: netSessions.length,
    sales: sales.length,
    walletMoved: !!sourceWallet,
  };

  const base = {
    sourceId,
    targetId,
    source: { name: source.name, phone: source.phone, type: source.type },
    target: { name: target.name, phone: target.phone, type: target.type },
    moved,
  };

  const nothingLeft =
    sessions.length === 0 &&
    subscriptions.length === 0 &&
    visitorNotes.length === 0 &&
    debts.length === 0 &&
    netSessions.length === 0;

  if ((source as any).deletedAt && nothingLeft) {
    return { ...base, sourceArchivedAt: ((source as any).deletedAt as Date).toISOString(), noop: true, dryRun };
  }

  if (dryRun) {
    return {
      ...base,
      sourceArchivedAt: (source as any).deletedAt ? ((source as any).deletedAt as Date).toISOString() : null,
      dryRun: true,
    };
  }

  // Wallet clash check BEFORE the transaction (clear error, no partial write).
  if (sourceWallet) {
    const clash = await prisma.snackWallet.findUnique({ where: { phone: target.phone }, select: { id: true } });
    if (clash && clash.id !== sourceWallet.id) {
      throw new ApiError(
        409,
        `يوجد محفظة بالرقم الهدف (${target.phone}) لشخص آخر — ادمج المحافظ أولاً`,
      );
    }
  }

  const archivedAt = await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({ where: { visitorId: sourceId }, data: { visitorId: targetId } });
    await tx.subscription.updateMany({ where: { visitorId: sourceId }, data: { visitorId: targetId } });
    await tx.visitorNote.updateMany({ where: { visitorId: sourceId }, data: { visitorId: targetId } });
    await tx.debt.updateMany({
      where: { visitorId: sourceId },
      data: { visitorId: targetId, name: target.name, phone: target.phone },
    });
    await tx.netSession.updateMany({ where: { visitorId: sourceId }, data: { visitorId: targetId } });
    if (sessionIds.length > 0 && source.name !== target.name) {
      await tx.sale.updateMany({
        where: { sessionId: { in: sessionIds } },
        data: { linkedName: target.name },
      });
    }
    if (sourceWallet) {
      await tx.snackWallet.update({
        where: { id: sourceWallet.id },
        data: { phone: target.phone, visitorName: target.name },
      });
    } else if (source.phone === target.phone && source.name !== target.name) {
      // Same-phone merge: keep the wallet owner name in sync with the survivor.
      const samePhoneWallet = await tx.snackWallet.findUnique({ where: { phone: target.phone } });
      if (samePhoneWallet) {
        await tx.snackWallet.update({
          where: { id: (samePhoneWallet as { id: string }).id },
          data: { visitorName: target.name },
        });
      }
    }
    // Archive (soft delete) the source — never a hard delete.
    const archived = await tx.visitor.update({
      where: { id: sourceId },
      data: { deletedAt: new Date() },
    });
    return (archived as any).deletedAt as Date;
  });

  const summary: MergeSummary = { ...base, sourceArchivedAt: archivedAt.toISOString() };
  console.info(`[mergePerson] ${JSON.stringify(summary)}`);
  return summary;
}
