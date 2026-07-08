import { prisma } from "../../lib/prisma";

const DEFAULT_INACTIVE_DAYS = 7;
const CONTACTED_SUPPRESSION_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;

export class FollowUpService {
  async getFollowUpList(showAll: boolean = false) {
    const now = new Date();
    const inactiveThreshold = new Date(now.getTime() - DEFAULT_INACTIVE_DAYS * 86_400_000);
    const contactedThreshold = new Date(now.getTime() - CONTACTED_SUPPRESSION_DAYS * 86_400_000);
    const gracePeriodThreshold = new Date(now.getTime() - GRACE_PERIOD_DAYS * 86_400_000);

    if (showAll) {
      // showAll: return all type=visitor or subscriber, exclude opt_out
      return prisma.visitor.findMany({
        where: {
          type: { in: ["visitor", "subscriber"] },
          OR: [
            { followUpStatus: null },
            { followUpStatus: { not: "opt_out" } },
          ],
        },
        orderBy: { lastVisit: "desc" },
      });
    }

    // Default list: type=visitor or subscriber, NOT opt_out, not contacted in last 30 days,
    // AND (no sessions OR most recent session checkIn < 7 days ago)
    // Grace period: exclude visitors registered less than 7 days ago with no visits
    return prisma.$queryRaw`
      SELECT v.*, latest."checkIn" as "lastCheckIn"
      FROM "Visitor" v
      LEFT JOIN LATERAL (
        SELECT s."checkIn"
        FROM "Session" s
        WHERE s."visitorId" = v.id
        ORDER BY s."checkIn" DESC
        LIMIT 1
      ) latest ON true
      WHERE v."type" IN ('visitor', 'subscriber')
        AND (v."followUpStatus" IS NULL OR v."followUpStatus" != 'opt_out')
        AND (v."followUpAt" IS NULL OR v."followUpAt" < ${contactedThreshold})
        AND (
          (latest."checkIn" IS NULL AND v."createdAt" < ${gracePeriodThreshold})
          OR (latest."checkIn" IS NOT NULL AND latest."checkIn" < ${inactiveThreshold})
        )
      ORDER BY COALESCE(latest."checkIn", v."createdAt") ASC
    `;
  }

  async markContacted(visitorId: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitor) throw new Error("Visitor not found");

    return prisma.visitor.update({
      where: { id: visitorId },
      data: {
        followUpStatus: "contacted",
        followUpAt: new Date(),
      },
    });
  }

  async optOut(visitorId: string) {
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitor) throw new Error("Visitor not found");

    return prisma.visitor.update({
      where: { id: visitorId },
      data: {
        followUpStatus: "opt_out",
      },
    });
  }
}

export const followUpService = new FollowUpService();
