import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";

const exportQuerySchema = z.object({
  from: z.string().min(1, "'from' is required"),
  to: z.string().min(1, "'to' is required"),
  format: z.enum(["xlsx"]).optional(),
  type: z.enum(["reports", "history"]).optional(),
});

export class ReportsController {
  async getPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = exportQuerySchema.parse(req.query);
      const fromDate = new Date(parsed.from);
      const toDate = new Date(parsed.to);
      toDate.setHours(23, 59, 59, 999);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new ApiError(400, "Invalid date format for 'from' or 'to'");
      }

      const [sessions, sales, expenses, bookings, courses, activeSubscriptions, settings] = await Promise.all([
        prisma.session.findMany({
          where: { checkIn: { gte: fromDate, lte: toDate }, checkOut: { not: null } },
          select: { sessionType: true, amount: true, paymentStatus: true, discountAmount: true, visitor: { select: { type: true } } },
        }),
        prisma.sale.findMany({
          where: { date: { gte: fromDate, lte: toDate } },
          select: { total: true, isHotDrink: true },
        }),
        prisma.expense.findMany({
          where: { date: { gte: fromDate, lte: toDate } },
          select: { amount: true },
        }),
        prisma.booking.findMany({
          where: { startTime: { gte: fromDate, lte: toDate }, status: "confirmed" },
          select: { price: true },
        }),
        prisma.course.findMany({
          where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
          select: { id: true },
        }),
        prisma.subscription.findMany({
          where: { status: "active" },
          select: { visitorId: true, amountPaid: true },
        }),
        prisma.settings.findFirst(),
      ]);

      const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

      // Visits
      const visitCount = sessions.length;
      const hoursRevenue = r(
        sessions.filter((s) => s.paymentStatus === "paid").reduce((sum, s) => sum + Number(s.amount), 0)
      );

      // Subscribers
      const activeCount = activeSubscriptions.length;
      const totalPaid = r(activeSubscriptions.reduce((sum, s) => sum + Number(s.amountPaid), 0));

      // Sales (snacks vs hot drinks)
      const snacksRevenue = r(sales.filter((s) => !s.isHotDrink).reduce((sum, s) => sum + Number(s.total), 0));
      const hotDrinksRevenue = r(sales.filter((s) => s.isHotDrink).reduce((sum, s) => sum + Number(s.total), 0));

      // Expenses
      const expensesTotal = r(expenses.reduce((sum, e) => sum + Number(e.amount), 0));
      const monthlyHotDrinksCost = settings ? Number(settings.hotDrinksMonthlyCost) : 0;
      const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
      const hotDrinksCost = r(monthlyHotDrinksCost * (daysInRange / 30));

      // Rooms & Courses
      const roomsRevenue = r(bookings.reduce((sum, b) => sum + Number(b.price), 0));
      let coursesRevenue = 0;
      if (courses.length > 0) {
        const trainees = await prisma.trainee.findMany({
          where: { courseId: { in: courses.map((c) => c.id) } },
          select: { amountPaid: true },
        });
        coursesRevenue = r(trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0));
      }

      // Financial summary
      const totalRevenue = r(hoursRevenue + snacksRevenue + hotDrinksRevenue + coursesRevenue + roomsRevenue);
      const netProfit = r(totalRevenue - expensesTotal - hotDrinksCost);

      // Total discounts given (already factored into hoursRevenue via reduced `amount`)
      const totalDiscounts = r(
        sessions.filter((s) => s.paymentStatus === "paid").reduce((sum, s) => sum + Number(s.discountAmount), 0)
      );

      res.status(200).json({
        success: true,
        data: {
          visits: { count: visitCount, hoursRevenue },
          subscribers: { activeCount, totalPaid },
          sales: { snacksRevenue, hotDrinksRevenue },
          expenses: { total: expensesTotal, hotDrinksCost },
          roomsCourses: { roomsRevenue, coursesRevenue },
          financialSummary: { hoursRevenue, snacksRevenue, hotDrinksRevenue, coursesRevenue, roomsRevenue, expenses: expensesTotal, hotDrinksCost, netProfit, totalDiscounts },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async exportReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = exportQuerySchema.parse(req.query);
      const fromDate = new Date(parsed.from);
      const toDate = new Date(parsed.to);
      toDate.setHours(23, 59, 59, 999);
      const exportType = parsed.type ?? "reports";

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new ApiError(400, "Invalid date format for 'from' or 'to'");
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Noon Coworking";
      workbook.created = new Date();

      const paymentStatusMap: Record<string, string> = {
        paid: "مدفوع",
        partial_debt: "دين جزئي",
        full_debt: "دين كامل",
      };
      const paymentMethodMap: Record<string, string> = {
        cash: "نقدي",
        card: "بطاقة",
        transfer: "تحويل",
      };
      const typeMap: Record<string, string> = {
        visitor: "زائر",
        subscriber: "مشترك",
        trainee: "متدرب",
      };

      // Fetch sessions (needed for both types: history shows them, reports needs revenue calc)
      const sessions = await prisma.session.findMany({
        where: {
          checkIn: { gte: fromDate, lte: toDate },
        },
          select: { sessionType: true, amount: true, paymentStatus: true, paymentMethod: true, checkIn: true, checkOut: true, discountAmount: true, discountNote: true, paymentAccount: true, visitor: { select: { name: true, type: true } } },
        orderBy: { checkIn: "asc" },
      });

      // Sheet 1: الزيارات (Visits) — history type ONLY
      if (exportType === "history") {
        const visitsSheet = workbook.addWorksheet("الزيارات");
        visitsSheet.columns = [
          { header: "اسم الزائر", key: "visitorName", width: 20 },
          { header: "النوع", key: "type", width: 12 },
          { header: "وقت الدخول", key: "checkIn", width: 20 },
          { header: "وقت الخروج", key: "checkOut", width: 20 },
          { header: "المدة (ساعات)", key: "duration", width: 14 },
          { header: "المبلغ", key: "amount", width: 12 },
          { header: "الخصم", key: "discount", width: 12 },
          { header: "ملاحظة الخصم", key: "discountNote", width: 16 },
          { header: "طريقة الدفع", key: "paymentMethod", width: 14 },
          { header: "الحساب / الجهة", key: "paymentAccount", width: 18 },
          { header: "حالة الدفع", key: "paymentStatus", width: 14 },
        ];

        for (const s of sessions) {
          const duration = s.checkOut
            ? Math.round(((s.checkOut.getTime() - s.checkIn.getTime()) / 3600000) * 100) / 100
            : null;
          visitsSheet.addRow({
            visitorName: s.visitor.name,
            type: typeMap[s.sessionType ?? s.visitor.type] || s.visitor.type,
            checkIn: s.checkIn.toISOString(),
            checkOut: s.checkOut ? s.checkOut.toISOString() : "لم يخرج",
            duration: duration !== null ? duration : "—",
            amount: Number(s.amount),
            discount: Number(s.discountAmount) > 0 ? Number(s.discountAmount) : "—",
            discountNote: s.discountNote || "—",
            paymentMethod: s.paymentMethod ? paymentMethodMap[s.paymentMethod] : "—",
            paymentAccount: s.paymentAccount || "—",
            paymentStatus: paymentStatusMap[s.paymentStatus] || s.paymentStatus,
          });
        }
      }

      // Sheet 1 (reports type): ملخص الزيارات (Visits Summary)
      if (exportType === "reports") {
        const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
        const visitsSummarySheet = workbook.addWorksheet("ملخص الزيارات");
        visitsSummarySheet.columns = [
          { header: "البند", key: "item", width: 28 },
          { header: "القيمة", key: "value", width: 16 },
        ];

        const totalVisits = sessions.length;
        const paidVisits = sessions.filter((s) => s.paymentStatus === "paid" && s.checkOut !== null);
        const totalRevenue = r2(paidVisits.reduce((sum, s) => sum + Number(s.amount), 0));
        const avgRevenue = paidVisits.length > 0 ? r2(totalRevenue / paidVisits.length) : 0;

        const visitorCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "visitor").length;
        const subscriberCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "subscriber").length;
        const traineeCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "trainee").length;

        visitsSummarySheet.addRow({ item: "إجمالي الزيارات", value: totalVisits });
        visitsSummarySheet.addRow({ item: "الزيارات المدفوعة", value: paidVisits.length });
        visitsSummarySheet.addRow({ item: "إيراد الجلسات", value: totalRevenue });
        visitsSummarySheet.addRow({ item: "متوسط إيراد الزيارة", value: avgRevenue });
        visitsSummarySheet.addRow({ item: "الزائرون", value: visitorCount });
        visitsSummarySheet.addRow({ item: "المشتركون", value: subscriberCount });
        visitsSummarySheet.addRow({ item: "المتدربون", value: traineeCount });
      }

      // Sheet 2: المشتركون (Subscribers)
      const subsSheet = workbook.addWorksheet("المشتركون");
      subsSheet.columns = [
        { header: "اسم الزائر", key: "visitorName", width: 20 },
        { header: "نوع الباقة", key: "packageType", width: 14 },
        { header: "تاريخ البداية", key: "startDate", width: 14 },
        { header: "تاريخ النهاية", key: "endDate", width: 14 },
        { header: "الحصة اليومية (ساعات)", key: "dailyQuotaHours", width: 18 },
        { header: "المبلغ المدفوع", key: "amountPaid", width: 14 },
        { header: "الحالة", key: "status", width: 12 },
      ];

      const subscriptions = await prisma.subscription.findMany({
        where: {
          OR: [
            { startDate: { gte: fromDate, lte: toDate } },
            { endDate: { gte: fromDate, lte: toDate } },
            { AND: [{ startDate: { lte: fromDate } }, { endDate: { gte: toDate } }] },
          ],
        },
        include: { visitor: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      });

      const subStatusMap: Record<string, string> = {
        active: "نشط",
        expired: "منتهي",
        paused: "متوقف",
        renewing: "جديد",
      };
      const pkgMap: Record<string, string> = {
        monthly: "شهري",
        weekly: "أسبوعي",
      };

      for (const sub of subscriptions) {
        subsSheet.addRow({
          visitorName: sub.visitor.name,
          packageType: pkgMap[sub.packageType] || sub.packageType,
          startDate: sub.startDate.toISOString().slice(0, 10),
          endDate: sub.endDate.toISOString().slice(0, 10),
          dailyQuotaHours: sub.dailyQuotaHours,
          amountPaid: Number(sub.amountPaid),
          status: subStatusMap[sub.status] || sub.status,
        });
      }

      // Sheet 3: السناكس والمشروبات (Sales)
      const salesSheet = workbook.addWorksheet("السناكس والمشروبات");
      salesSheet.columns = [
        { header: "التاريخ", key: "date", width: 14 },
        { header: "اسم الصنف", key: "itemName", width: 18 },
        { header: "الكمية", key: "quantity", width: 10 },
        { header: "الإجمالي", key: "total", width: 12 },
        { header: "مشروب ساخن", key: "isHotDrink", width: 14 },
        { header: "طريقة الدفع", key: "paymentMethod", width: 14 },
      ];

      const sales = await prisma.sale.findMany({
        where: {
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: "asc" },
      });

      for (const sale of sales) {
        salesSheet.addRow({
          date: sale.date.toISOString().slice(0, 10),
          itemName: sale.itemName,
          quantity: sale.quantity,
          total: Number(sale.total),
          isHotDrink: sale.isHotDrink ? "نعم" : "لا",
          paymentMethod: paymentMethodMap[sale.paymentMethod] || sale.paymentMethod,
        });
      }

      // Sheet 4: المصروفات (Expenses)
      const expensesSheet = workbook.addWorksheet("المصروفات");
      expensesSheet.columns = [
        { header: "التاريخ", key: "date", width: 14 },
        { header: "الوصف", key: "description", width: 24 },
        { header: "الفئة", key: "category", width: 14 },
        { header: "المبلغ", key: "amount", width: 12 },
      ];

      const expenses = await prisma.expense.findMany({
        where: {
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: "asc" },
      });

      const categoryMap: Record<string, string> = {
        electricity: "كهرباء",
        rent: "إيجار",
        salaries: "رواتب",
        maintenance: "صيانة",
        marketing: "تسويق",
        other: "أخرى",
      };

      for (const exp of expenses) {
        expensesSheet.addRow({
          date: exp.date.toISOString().slice(0, 10),
          description: exp.description,
          category: categoryMap[exp.category] || exp.category,
          amount: Number(exp.amount),
        });
      }

      // Sheet 5: القاعات والدورات (Rooms & Courses)
      const roomsSheet = workbook.addWorksheet("القاعات والدورات");
      roomsSheet.columns = [
        { header: "النوع", key: "type", width: 10 },
        { header: "الاسم / الغرفة", key: "name", width: 22 },
        { header: "الحجز / الدورة", key: "bookerOrCourse", width: 22 },
        { header: "المؤجر / المدرب", key: "trainerOrBooker", width: 18 },
        { header: "الوقت / التواريخ", key: "timeOrDates", width: 28 },
        { header: "السعر / الإيراد", key: "price", width: 14 },
        { header: "عدد المتدربين", key: "traineeCount", width: 14 },
      ];

      // Bookings in range
      const bookings = await prisma.booking.findMany({
        where: {
          startTime: { gte: fromDate, lte: toDate },
        },
        include: { room: { select: { name: true } } },
        orderBy: { startTime: "asc" },
      });

      for (const bk of bookings) {
        roomsSheet.addRow({
          type: "حجز",
          name: bk.room.name,
          bookerOrCourse: bk.purpose,
          trainerOrBooker: bk.bookerName,
          timeOrDates: `${bk.startTime.toISOString()} - ${bk.endTime.toISOString()}`,
          price: Number(bk.price),
          traineeCount: "—",
        });
      }

      // Courses active in range
      const courses = await prisma.course.findMany({
        where: {
          startDate: { lte: toDate },
          endDate: { gte: fromDate },
        },
        include: { room: { select: { name: true } }, trainees: true },
        orderBy: { startDate: "asc" },
      });

      for (const course of courses) {
        const traineeCount = course.trainees.length;
        const revenue = course.trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0);
        roomsSheet.addRow({
          type: "دورة",
          name: course.room.name,
          bookerOrCourse: course.name,
          trainerOrBooker: course.trainer,
          timeOrDates: `${course.startDate.toISOString().slice(0, 10)} - ${course.endDate.toISOString().slice(0, 10)}`,
          price: Math.round((revenue + Number.EPSILON) * 100) / 100,
          traineeCount,
        });
      }

      // Sheet 6: الملخص المالي (Financial Summary)
      const summarySheet = workbook.addWorksheet("الملخص المالي");
      summarySheet.columns = [
        { header: "البند", key: "item", width: 32 },
        { header: "المبلغ", key: "amount", width: 16 },
      ];

      // 1. Session revenue (cash-basis: only paid sessions count)
      const sessionRev = sessions
        .filter((s) => s.checkOut !== null && s.paymentStatus === "paid")
        .reduce((sum, s) => sum + Number(s.amount), 0);

      // 2. Sale revenue
      const saleRev = sales.reduce((sum, s) => sum + Number(s.total), 0);

      // 3. Course revenue
      let courseRev = 0;
      if (courses.length > 0) {
        const courseIds = courses.map((c) => c.id);
        const trainees = await prisma.trainee.findMany({
          where: { courseId: { in: courseIds } },
          select: { amountPaid: true },
        });
        courseRev = trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0);
      }

      // 4. Booking revenue
      const bookingRev = bookings
        .filter((b) => b.status === "confirmed")
        .reduce((sum, b) => sum + Number(b.price), 0);

      // 5. Collected debt revenue (cash-basis)
      const collectedDebts = await prisma.debt.findMany({
        where: {
          status: "collected",
          collectedAt: { gte: fromDate, lte: toDate },
        },
        select: { amount: true },
      });
      const debtRev = collectedDebts.reduce((sum, d) => sum + Number(d.amount), 0);

      // 6. Total discounts given
      const totalDiscounts = sessions
        .filter((s) => s.checkOut !== null && s.paymentStatus === "paid")
        .reduce((sum, s) => sum + Number(s.discountAmount), 0);

      // 7. Expenses
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

      // 8. hotDrinksMonthlyCost prorated
      const settings = await prisma.settings.findFirst();
      const monthlyHotDrinksCost = settings ? Number(settings.hotDrinksMonthlyCost) : 0;
      const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
      const hotDrinksProrated = Math.round((monthlyHotDrinksCost * (daysInRange / 30) + Number.EPSILON) * 100) / 100;

      const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

      const totalRevenue = r(sessionRev + saleRev + courseRev + bookingRev + debtRev);
      const totalDeductions = r(totalExpenses + hotDrinksProrated);
      const netProfit = r(totalRevenue - totalDeductions);

      summarySheet.addRow({ item: "إيراد الجلسات", amount: r(sessionRev) });
      summarySheet.addRow({ item: "إيراد المبيعات", amount: r(saleRev) });
      summarySheet.addRow({ item: "إيراد الدورات", amount: r(courseRev) });
      summarySheet.addRow({ item: "إيراد الحجوزات", amount: r(bookingRev) });
      summarySheet.addRow({ item: "إيراد الديون المحصلة", amount: r(debtRev) });
      summarySheet.addRow({ item: "الخصومات", amount: r(totalDiscounts) });
      summarySheet.addRow({ item: "الإيرادات الإجمالية", amount: totalRevenue });
      summarySheet.addRow({ item: "المصروفات", amount: r(totalExpenses) });
      summarySheet.addRow({ item: "تكلفة المشروبات الساخنة (نسبة)", amount: hotDrinksProrated });
      summarySheet.addRow({ item: "صافي الربح", amount: netProfit });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${exportType}_${parsed.from}_${parsed.to}.xlsx`
      );
      res.status(200).send(Buffer.from(buffer));
    } catch (error) {
      next(error);
    }
  }
}

export const reportsController = new ReportsController();
