import { prisma } from "../../lib/prisma";
import { sessionsService } from "../sessions/service";
import { palestineStartOfDay } from "../../lib/timezone";

export class IntegrationsService {
  async anoonCheckIn(phone: string): Promise<{ session: any; alreadyActive: boolean } | null> {
    const visitor = await prisma.visitor.findFirst({
      where: { phone },
    });

    if (!visitor) {
      return null;
    }

    const activeSession = await prisma.session.findFirst({
      where: { visitorId: visitor.id, checkOut: null },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });
    if (activeSession) {
      return { session: activeSession, alreadyActive: true };
    }

    const session = await sessionsService.checkIn({ visitorId: visitor.id });

    return { session, alreadyActive: false };
  }

  async anoonVisitorCheckIn(phone: string, name: string): Promise<{ session: any; alreadyActive: boolean }> {
    let visitor = await prisma.visitor.findFirst({ where: { phone } });
    if (!visitor) {
      visitor = await prisma.visitor.create({
        data: { name, phone, type: "visitor" },
      });
    }

    const todayStart = palestineStartOfDay(new Date());

    const existingSession = await prisma.session.findFirst({
      where: {
        visitorId: visitor.id,
        checkOut: null,
        checkIn: { gte: todayStart },
      },
      include: { visitor: true, snackOrders: true },
    });
    if (existingSession) {
      return { session: existingSession, alreadyActive: true };
    }

    const session = await sessionsService.checkIn({ visitorId: visitor.id });
    return { session, alreadyActive: false };
  }
}

export const integrationsService = new IntegrationsService();
