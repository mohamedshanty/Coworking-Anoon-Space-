"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followUpService = exports.FollowUpService = void 0;
const prisma_1 = require("../../lib/prisma");
const DEFAULT_INACTIVE_DAYS = 14;
const CONTACTED_SUPPRESSION_DAYS = 30;
class FollowUpService {
    async getFollowUpList(showAll = false) {
        const now = new Date();
        const inactiveThreshold = new Date(now.getTime() - DEFAULT_INACTIVE_DAYS * 86_400_000);
        const contactedThreshold = new Date(now.getTime() - CONTACTED_SUPPRESSION_DAYS * 86_400_000);
        if (showAll) {
            // showAll: return all type=visitor, exclude opt_out
            // Prisma's { not: "opt_out" } excludes null values in Postgres, so use OR explicitly
            return prisma_1.prisma.visitor.findMany({
                where: {
                    type: "visitor",
                    OR: [
                        { followUpStatus: null },
                        { followUpStatus: { not: "opt_out" } },
                    ],
                },
                orderBy: { lastVisit: "desc" },
            });
        }
        // Default list: type=visitor, NOT opt_out, not contacted in last 30 days,
        // AND (no sessions OR most recent session checkIn < 14 days ago)
        return prisma_1.prisma.$queryRaw `
      SELECT v.*
      FROM "Visitor" v
      LEFT JOIN LATERAL (
        SELECT s."checkIn"
        FROM "Session" s
        WHERE s."visitorId" = v.id
        ORDER BY s."checkIn" DESC
        LIMIT 1
      ) latest ON true
      WHERE v."type" = 'visitor'
        AND (v."followUpStatus" IS NULL OR v."followUpStatus" != 'opt_out')
        AND (v."followUpAt" IS NULL OR v."followUpAt" < ${contactedThreshold})
        AND (latest."checkIn" IS NULL OR latest."checkIn" < ${inactiveThreshold})
      ORDER BY v."lastVisit" DESC
    `;
    }
    async markContacted(visitorId) {
        const visitor = await prisma_1.prisma.visitor.findUnique({ where: { id: visitorId } });
        if (!visitor)
            throw new Error("Visitor not found");
        return prisma_1.prisma.visitor.update({
            where: { id: visitorId },
            data: {
                followUpStatus: "contacted",
                followUpAt: new Date(),
            },
        });
    }
    async optOut(visitorId) {
        const visitor = await prisma_1.prisma.visitor.findUnique({ where: { id: visitorId } });
        if (!visitor)
            throw new Error("Visitor not found");
        return prisma_1.prisma.visitor.update({
            where: { id: visitorId },
            data: {
                followUpStatus: "opt_out",
            },
        });
    }
}
exports.FollowUpService = FollowUpService;
exports.followUpService = new FollowUpService();
