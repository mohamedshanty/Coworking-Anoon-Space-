"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLogsController = exports.LoginLogsController = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const loginLogsQuerySchema = zod_1.z.object({
    from: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(200).optional().default(50),
});
class LoginLogsController {
    async getLogs(req, res, next) {
        try {
            const parsed = loginLogsQuerySchema.parse(req.query);
            const where = {};
            if (parsed.from || parsed.to) {
                where.at = {};
                if (parsed.from)
                    where.at.gte = new Date(parsed.from);
                if (parsed.to) {
                    const toDate = new Date(parsed.to);
                    toDate.setHours(23, 59, 59, 999);
                    where.at.lte = toDate;
                }
            }
            const skip = (parsed.page - 1) * parsed.limit;
            const [data, total] = await Promise.all([
                prisma_1.prisma.loginLog.findMany({
                    where,
                    orderBy: { at: "desc" },
                    skip,
                    take: parsed.limit,
                    select: {
                        id: true,
                        userId: true,
                        username: true,
                        at: true,
                        status: true,
                        ip: true,
                        userAgent: true,
                    },
                }),
                prisma_1.prisma.loginLog.count({ where }),
            ]);
            res.status(200).json({
                success: true,
                data,
                pagination: {
                    page: parsed.page,
                    limit: parsed.limit,
                    total,
                    totalPages: Math.ceil(total / parsed.limit),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.LoginLogsController = LoginLogsController;
exports.loginLogsController = new LoginLogsController();
