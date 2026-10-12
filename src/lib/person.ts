import { prisma } from "./prisma";
import { ApiError } from "./ApiError";

/**
 * Soft-delete (archive) helpers for person records (Visitor rows).
 *
 * Deleting only sets `deletedAt` — every linked row (sessions, snack
 * orders, debts, wallet transactions, subscriptions, notes) stays intact,
 * and the person-pointing FKs are onDelete: Restrict so a hard delete can
 * never wipe history by accident.
 */

/** Spread into Visitor `where` clauses to hide archived people from active lists. */
export const ACTIVE_VISITOR = { deletedAt: null } as const;

export interface ArchivedPersonInfo {
  id: string;
  name: string;
  phone: string;
  type: string | null;
}

/**
 * 409 error carrying the archived person's identity so the frontend can
 * offer "restore / link" instead of creating a duplicate or showing a
 * generic error. Serialized by errorHandler via `archivedPerson`.
 */
export function archivedPersonError(person: {
  id: string;
  name: string;
  phone: string;
  type?: string;
}): ApiError {
  return Object.assign(
    new ApiError(
      409,
      `هذا الشخص مؤرشف: ${person.name} (${person.phone}). يمكنك استعادته بدل إنشاء سجل جديد.`,
    ),
    {
      archivedPerson: {
        id: person.id,
        name: person.name,
        phone: person.phone,
        type: person.type ?? null,
      } satisfies ArchivedPersonInfo,
    },
  );
}

export interface PhoneConflict {
  id: string | null;
  name: string;
  phone: string;
  type: string;
  sessionCount: number;
  /** True when the holder is the (separate) employee roster, which has no Visitor id to merge into. */
  rosterOnly?: boolean;
}

/**
 * App-level uniqueness (no DB constraint): among ACTIVE rows, a phone may
 * belong to only one person of the managed types
 * (subscriber / trainee / tamkeen / employee). Plain 'visitor' rows may
 * share a phone (shared-number case).
 *
 * Returns the conflicting ACTIVE holder (excluding `excludeId`), or null.
 *
 * Set `includeRoster: false` when the excluded person IS the roster holder
 * (converting away from type "employee"): the roster row with the same phone
 * is their own, not another person's.
 */
export async function findActivePhoneConflict(
  phone: string,
  excludeId?: string,
  opts?: { includeRoster?: boolean },
): Promise<PhoneConflict | null> {
  const notSelf = excludeId ? { id: { not: excludeId } } : {};

  // Employee roster first (separate table, no Visitor id → no merge offer).
  if (opts?.includeRoster !== false) {
    const roster = await prisma.employeeRoster.findUnique({
      where: { phone },
      select: { id: true, name: true },
    });
    if (roster) {
      return {
        id: null,
        name: roster.name,
        phone,
        type: "employee",
        sessionCount: 0,
        rosterOnly: true,
      };
    }
  }

  const holder = await prisma.visitor.findFirst({
    where: {
      phone,
      deletedAt: null,
      ...notSelf,
      OR: [{ type: { in: ["subscriber", "trainee", "tamkeen", "employee"] } }, { subscriptions: { some: {} } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, phone: true, type: true, _count: { select: { sessions: true } } },
  });
  if (!holder) return null;
  return {
    id: holder.id,
    name: holder.name,
    phone: holder.phone,
    type: holder.type,
    sessionCount: holder._count.sessions,
  };
}

/** 409 carrying the conflicting person so the UI can offer a merge. */
export function phoneConflictError(conflict: PhoneConflict, targetType: string): ApiError {
  return Object.assign(
    new ApiError(
      409,
      `هذا الرقم مسجل لشخص آخر (${conflict.name}) — يمكنك دمج السجلين بدل التحويل`,
    ),
    {
      conflictingPerson: { ...conflict },
      targetType,
    },
  );
}

/**
 * Keep the phone-keyed SnackWallet attached when a person's phone changes.
 * Must run inside the caller's transaction (same tx as the visitor update).
 *
 * - No wallet on the old phone → nothing to do.
 * - Wallet on the old phone + a *different* wallet already on the new phone
 *   → 409 with a clear message (never merge/detach silently).
 * - Otherwise move the wallet to the new phone (and refresh the owner name
 *   when a new name is provided).
 */
export async function syncWalletPhone(
  tx: {
    snackWallet: {
      findUnique(args: any): Promise<{ id: string } | null>;
      update(args: any): Promise<unknown>;
    };
  },
  opts: { oldPhone: string; newPhone: string; newName?: string },
): Promise<void> {
  const { oldPhone, newPhone, newName } = opts;
  if (!oldPhone || !newPhone) return;

  if (oldPhone === newPhone) {
    if (newName) {
      const wallet = await tx.snackWallet.findUnique({ where: { phone: oldPhone } });
      if (wallet) {
        await tx.snackWallet.update({
          where: { id: wallet.id },
          data: { visitorName: newName },
        });
      }
    }
    return;
  }

  const wallet = await tx.snackWallet.findUnique({ where: { phone: oldPhone } });
  if (!wallet) return;

  const clash = await tx.snackWallet.findUnique({ where: { phone: newPhone } });
  if (clash && clash.id !== wallet.id) {
    throw new ApiError(
      409,
      `يوجد محفظة مسجلة بالرقم الجديد (${newPhone}) لشخص آخر — غيّر الرقم أو ادمج المحافظ أولاً`,
    );
  }

  await tx.snackWallet.update({
    where: { id: wallet.id },
    data: {
      phone: newPhone,
      ...(newName ? { visitorName: newName } : {}),
    },
  });
}
