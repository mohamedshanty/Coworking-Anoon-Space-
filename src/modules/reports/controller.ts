import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";

const exportQuerySchema = z.object({
  from: z.string().min(1, "'from' is required"),
  to: z.string().min(1, "'to' is required"),
  format: z.enum(["xlsx"]).optional(),
});

export class ReportsController {
  async exportReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = exportQuerySchema.parse(req.query);
      const fromDate = new Date(parsed.from);
      const toDate = new Date(parsed.to);
      toDate.setHours(23, 59, 59, 999);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new ApiError(400, "Invalid date format for 'from' or 'to'");
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Noon Coworking";
      workbook.created = new Date();

      // Sheet 1: الزيارات (Visits)
      const visitsSheet = workbook.addWorksheet("الزيارات");
      visitsSheet.columns = [
        { header: "اسم الزائر", key: "visitorName", width: 20 },
        { header: "النوع", key: "type", width: 12 },
        { header: "وقت الدخول", key: "checkIn", width: 20 },
        { header: "وقت الخروج", key: "checkOut", width: 20 },
        { header: "المدة (ساعات)", key: "duration", width: 14 },
        { header: "المبلغ", key: "amount", width: 12 },
        { header: "حالة الدفع", key: "paymentStatus", width: 14 },
        { header: "طريقة الدفع", key: "paymentMethod", width: 14 },
      ];

      const sessions = await prisma.session.findMany({
        where: {
          checkIn: { gte: fromDate, lte: toDate },
        },
        include: { visitor: { select: { name: true, type: true } } },
        orderBy: { checkIn: "asc" },
      });

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

      for (const s of sessions) {
        const duration = s.checkOut
          ? Math.round(((s.checkOut.getTime() - s.checkIn.getTime()) / 3600000) * 100) / 100
          : null;
        visitsSheet.addRow({
          visitorName: s.visitor.name,
          type: typeMap[s.visitor.type] || s.visitor.type,
          checkIn: s.checkIn.toISOString(),
          checkOut: s.checkOut ? s.checkOut.toISOString() : "نشط",
          duration: duration !== null ? duration : "—",
          amount: Number(s.amount),
          paymentStatus: paymentStatusMap[s.paymentStatus] || s.paymentStatus,
          paymentMethod: s.paymentMethod ? paymentMethodMap[s.paymentMethod] : "—",
        });
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

      // 1. Session revenue
      const sessionRev = sessions
        .filter((s) => s.checkOut !== null)
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

      // 6. Expenses
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

      // 7. hotDrinksMonthlyCost prorated
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
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=report_${parsed.from}_${parsed.to}.xlsx`
      );
      res.status(200).send(Buffer.from(buffer));
    } catch (error) {
      next(error);
    }
  }
}

export const reportsController = new ReportsController();
