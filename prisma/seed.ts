import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const now = Date.now();
const day = 86_400_000;
const hour = 3_600_000;
const d = (offsetDays: number, hOffset = 0) =>
  new Date(now - offsetDays * day + hOffset * hour);

const arNames = [
  "أحمد خليل", "سارة يوسف", "محمد عبدالله", "فاطمة الزهراء", "خالد ناصر",
  "ليلى منصور", "عمر شاهين", "نور الدين", "ريم حسن", "يوسف الكردي",
  "هبة سليم", "مصطفى زيدان", "آية مرعي", "بسام درويش", "إيمان حمدان",
];

const phone = (i: number) => `0599${(1000000 + i * 12347).toString().slice(0, 6)}`;

async function main() {
  console.log("Cleaning database...");
  await prisma.snackOrder.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.debt.deleteMany({});
  await prisma.trainee.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.visitor.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.loginLog.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.settings.deleteMany({});
  await prisma.expense.deleteMany({});

  console.log("Seeding data...");

  // 1. Staff & Permissions
  console.log("Seeding staff & permissions...");
  const passwordHash = await bcrypt.hash("password123", 10);
  
  const staffMembers = [
    { id: "u1", name: "المدير العام", username: "admin", role: "admin" as const, passwordHash },
    { id: "u2", name: "سامي الموظف", username: "sami", role: "manager" as const, passwordHash },
    { id: "u3", name: "نور الموظفة", username: "noor", role: "staff" as const, passwordHash },
  ];

  for (const s of staffMembers) {
    await prisma.staff.create({ data: s });
  }

  const pages = [
    "الرئيسية", "داخل المساحة", "السجل", "المشتركون", "السناكس", "المشروبات",
    "المخزون", "المصروفات", "المديونيات", "القاعات", "الدورات", "المتابعة",
    "التقارير", "الإعدادات"
  ];

  for (const page of pages) {
    // Admin (u1)
    await prisma.permission.create({
      data: { staffId: "u1", pageKey: page, canView: true, canEdit: true, canDelete: true }
    });
    // Manager (u2)
    await prisma.permission.create({
      data: { staffId: "u2", pageKey: page, canView: true, canEdit: true, canDelete: false }
    });
    // Staff (u3)
    await prisma.permission.create({
      data: { staffId: "u3", pageKey: page, canView: true, canEdit: false, canDelete: false }
    });
  }

  // 2. Settings
  console.log("Seeding settings...");
  await prisma.settings.create({
    data: {
      id: "default",
      hourlyRate: 10,
      fullDayPrice: 50,
      fullDayThresholdHours: 6,
      hotDrinksMonthlyCost: 400,
      company: {
        name: "مساحة العمل المشترك",
        phone: "022-345678",
        email: "info@workspace.ps",
        address: "رام الله، فلسطين"
      }
    }
  });

  // 3. Visitors
  console.log("Seeding visitors...");
  const visitors = arNames.map((name, i) => ({
    id: `v${i + 1}`,
    name,
    phone: phone(i),
    type: (i < 5 ? "subscriber" : i < 9 ? "trainee" : "visitor") as "subscriber" | "trainee" | "visitor",
    lastVisit: d(i * 2),
    followUpStatus: (i >= 10 ? "needs" : null) as "needs" | null,
    followUpAt: i >= 10 ? d(i * 2 + 1) : null,
  }));

  for (const v of visitors) {
    await prisma.visitor.create({ data: v });
  }

  // 4. Subscriptions
  console.log("Seeding subscriptions...");
  const subscriptions = [
    { id: "sub1", visitorId: "v1", packageType: "monthly" as const, startDate: d(15), endDate: d(-15), dailyQuotaHours: 6, daysUsed: 12, amountPaid: 350, status: "active" as const },
    { id: "sub2", visitorId: "v2", packageType: "monthly" as const, startDate: d(28), endDate: d(-2), dailyQuotaHours: 8, daysUsed: 25, amountPaid: 400, status: "active" as const },
    { id: "sub3", visitorId: "v3", packageType: "weekly" as const, startDate: d(5), endDate: d(-2), dailyQuotaHours: 4, daysUsed: 4, amountPaid: 100, status: "active" as const },
    { id: "sub4", visitorId: "v4", packageType: "monthly" as const, startDate: d(40), endDate: d(10), dailyQuotaHours: 6, daysUsed: 28, amountPaid: 350, status: "expired" as const },
    { id: "sub5", visitorId: "v5", packageType: "monthly" as const, startDate: d(10), endDate: d(-20), dailyQuotaHours: 8, daysUsed: 3, amountPaid: 400, status: "paused" as const },
  ];

  for (const sub of subscriptions) {
    await prisma.subscription.create({ data: sub });
  }

  // 5. Inventory Items
  console.log("Seeding inventory items...");
  const inventoryItems = [
    { id: "i1", name: "شيبس", quantity: 24, sellPrice: 5, costPrice: 3, lastRestockDate: d(5), alertThreshold: 10 },
    { id: "i2", name: "بسكويت", quantity: 8, sellPrice: 3, costPrice: 1.5, lastRestockDate: d(12), alertThreshold: 10 },
    { id: "i3", name: "ماء معدنية", quantity: 40, sellPrice: 2, costPrice: 1, lastRestockDate: d(3), alertThreshold: 15 },
    { id: "i4", name: "عصير", quantity: 3, sellPrice: 6, costPrice: 4, lastRestockDate: d(20), alertThreshold: 8 },
    { id: "i5", name: "شوكولاتة", quantity: 15, sellPrice: 4, costPrice: 2.5, lastRestockDate: d(7), alertThreshold: 10 },
    { id: "i6", name: "مكسرات", quantity: 6, sellPrice: 8, costPrice: 5, lastRestockDate: d(15), alertThreshold: 8 },
  ];

  for (const item of inventoryItems) {
    await prisma.inventoryItem.create({ data: item });
  }

  // 6. Sessions & Snack Orders
  console.log("Seeding sessions...");
  const liveSessions = [
    { id: "s-live-1", visitorId: "v1", checkIn: new Date(now - 1.5 * hour), checkOut: null, amount: 0, paymentStatus: "full_debt" as const, paymentMethod: null, snackOrders: [] },
    { id: "s-live-2", visitorId: "v10", checkIn: new Date(now - 0.7 * hour), checkOut: null, amount: 0, paymentStatus: "full_debt" as const, paymentMethod: null, snackOrders: [{ itemId: "i1", qty: 1, total: 5, isHotDrink: false }] },
    { id: "s-live-3", visitorId: "v11", checkIn: new Date(now - 3.2 * hour), checkOut: null, amount: 0, paymentStatus: "full_debt" as const, paymentMethod: null, snackOrders: [] },
    { id: "s-live-4", visitorId: "v12", checkIn: new Date(now - 6.4 * hour), checkOut: null, amount: 0, paymentStatus: "full_debt" as const, paymentMethod: null, snackOrders: [] },
  ];

  const historicalSessions = Array.from({ length: 30 }).map((_, i) => {
    const ci = new Date(now - (i + 1) * 0.6 * day);
    const dur = 1 + (i % 5);
    const co = new Date(ci.getTime() + dur * hour);
    const amt = dur * 10;
    
    const paymentStatuses: ("paid" | "partial_debt" | "full_debt")[] = ["paid", "partial_debt", "full_debt"];
    const paymentStatus = (i % 7 === 0 ? "full_debt" : i % 5 === 0 ? "partial_debt" : "paid") as "paid" | "partial_debt" | "full_debt";
    
    const paymentMethods: ("cash" | "card" | "transfer")[] = ["cash", "card", "transfer"];
    const paymentMethod = (i % 3 === 0 ? "cash" : i % 3 === 1 ? "card" : "transfer") as "cash" | "card" | "transfer";

    return {
      id: `s${i + 100}`,
      visitorId: `v${(i % 15) + 1}`,
      checkIn: ci,
      checkOut: co,
      amount: amt,
      paymentStatus,
      paymentMethod,
      snackOrders: i % 4 === 0 ? [{ itemId: "i1", qty: 1, total: 5, isHotDrink: false }] : []
    };
  });

  const allSessions = [...liveSessions, ...historicalSessions];

  for (const s of allSessions) {
    const { snackOrders, ...sessionData } = s;
    await prisma.session.create({
      data: {
        ...sessionData,
        snackOrders: {
          create: snackOrders.map(o => ({
            itemId: o.itemId,
            qty: o.qty,
            total: o.total,
            isHotDrink: o.isHotDrink
          }))
        }
      }
    });
  }

  // 7. Sales (Snacks)
  console.log("Seeding sales...");
  for (let i = 0; i < 20; i++) {
    const item = inventoryItems[i % inventoryItems.length];
    const qty = 1 + (i % 3);
    const paymentMethod = (i % 2 === 0 ? "cash" : "card") as "cash" | "card";
    await prisma.sale.create({
      data: {
        id: `sale${i}`,
        itemId: item.id,
        itemName: item.name,
        quantity: qty,
        total: qty * item.sellPrice,
        sessionId: i % 3 === 0 ? "s100" : null,
        linkedName: i % 3 === 0 ? arNames[i % arNames.length] : null,
        paymentMethod,
        isHotDrink: false,
        date: d(i * 0.3),
      }
    });
  }

  // 8. Hot Drinks (also Sale model)
  console.log("Seeding hot drinks...");
  const drinkTypes = [
    { name: "قهوة", price: 6 },
    { name: "نسكافيه", price: 5 },
    { name: "شاي", price: 3 },
    { name: "كابتشينو", price: 8 },
  ];

  for (let i = 0; i < 15; i++) {
    const t = drinkTypes[i % drinkTypes.length];
    const paymentMethod = (i % 2 === 0 ? "cash" : "card") as "cash" | "card";
    await prisma.sale.create({
      data: {
        id: `hd${i}`,
        itemId: `hot-${t.name}`,
        itemName: t.name,
        quantity: 1,
        total: t.price,
        sessionId: i % 2 === 0 ? "s100" : null,
        linkedName: i % 2 === 0 ? arNames[i % arNames.length] : null,
        paymentMethod,
        isHotDrink: true,
        date: d(i * 0.4),
      }
    });
  }

  // 9. Expenses
  console.log("Seeding expenses...");
  const expenses = [
    { id: "e1", description: "فاتورة كهرباء", category: "electricity" as const, amount: 380, date: d(3) },
    { id: "e2", description: "إيجار الشهر", category: "rent" as const, amount: 1500, date: d(8) },
    { id: "e3", description: "رواتب موظفين", category: "salaries" as const, amount: 2400, date: d(10) },
    { id: "e4", description: "صيانة مكيف", category: "maintenance" as const, amount: 220, date: d(14) },
    { id: "e5", description: "إيجار فيسبوك", category: "marketing" as const, amount: 150, date: d(20) },
    { id: "e6", description: "أدوات تنظيف", category: "other" as const, amount: 80, date: d(22) },
  ];

  for (const exp of expenses) {
    await prisma.expense.create({ data: exp });
  }

  // 10. Debts
  console.log("Seeding debts...");
  const debts = [
    { id: "d1", visitorId: "v1", name: "أحمد خليل", phone: phone(0), amount: 45, type: "session" as const, status: "unpaid" as const, createdAt: d(18), collectedAt: null, note: null },
    { id: "d2", visitorId: "v6", name: "ليلى منصور", phone: phone(5), amount: 30, type: "session" as const, status: "unpaid" as const, createdAt: d(5), collectedAt: null, note: null },
    { id: "d3", visitorId: null, name: "زائر مجهول", phone: "0598123456", amount: 20, type: "manual" as const, status: "unpaid" as const, createdAt: d(2), collectedAt: null, note: "وعد بالدفع غداً" },
    { id: "d4", visitorId: "v7", name: "عمر شاهين", phone: phone(6), amount: 60, type: "session" as const, status: "collected" as const, createdAt: d(20), collectedAt: d(1), note: null },
  ];

  for (const debt of debts) {
    await prisma.debt.create({ data: debt });
  }

  // 11. Rooms
  console.log("Seeding rooms...");
  const rooms = [
    { id: "r1", name: "قاعة الاجتماعات الكبرى" },
    { id: "r2", name: "قاعة التدريب" },
    { id: "r3", name: "غرفة الاجتماعات الصغيرة" },
  ];

  for (const room of rooms) {
    await prisma.room.create({ data: room });
  }

  // 12. Bookings
  console.log("Seeding bookings...");
  const bookings = [
    { id: "b1", roomId: "r1", bookerName: "شركة الأمل", bookerPhone: "0599100200", purpose: "اجتماع مجلس إدارة", startTime: new Date(now + 2 * hour), endTime: new Date(now + 4 * hour), price: 200, status: "confirmed" as const },
    { id: "b2", roomId: "r2", bookerName: "د. سامي", bookerPhone: "0599200300", purpose: "ورشة تدريبية", startTime: new Date(now + 1 * day), endTime: new Date(now + 1 * day + 3 * hour), price: 300, status: "confirmed" as const },
    { id: "b3", roomId: "r3", bookerName: "محمد سعيد", bookerPhone: "0599300400", purpose: "مقابلة عمل", startTime: new Date(now - 1 * day), endTime: new Date(now - 1 * day + 1 * hour), price: 50, status: "confirmed" as const },
  ];

  for (const bk of bookings) {
    await prisma.booking.create({ data: bk });
  }

  // 13. Courses & Trainees
  console.log("Seeding courses & trainees...");
  const courses = [
    { id: "c1", name: "دورة تطوير الويب", trainer: "م. أحمد سعيد", startDate: d(10), endDate: d(-20), sessionsCount: 12, pricePerTrainee: 400, maxSeats: 15, roomId: "r2" },
    { id: "c2", name: "دورة التصميم الجرافيكي", trainer: "أ. ليلى نجم", startDate: d(20), endDate: d(-10), sessionsCount: 10, pricePerTrainee: 350, maxSeats: 12, roomId: "r2" },
    { id: "c3", name: "دورة اللغة الإنجليزية", trainer: "أ. خالد", startDate: d(-5), endDate: d(-35), sessionsCount: 16, pricePerTrainee: 500, maxSeats: 20, roomId: "r1" },
  ];

  for (const cr of courses) {
    await prisma.course.create({ data: cr });
  }

  const trainees = [
    { id: "t1", courseId: "c1", name: "يوسف الكردي", phone: phone(9), amountPaid: 400, paymentStatus: "full" as const, attendancePercent: 85 },
    { id: "t2", courseId: "c1", name: "هبة سليم", phone: phone(10), amountPaid: 200, paymentStatus: "installment" as const, attendancePercent: 70 },
    { id: "t3", courseId: "c2", name: "مصطفى زيدان", phone: phone(11), amountPaid: 350, paymentStatus: "full" as const, attendancePercent: 90 },
    { id: "t4", courseId: "c2", name: "آية مرعي", phone: phone(12), amountPaid: 350, paymentStatus: "full" as const, attendancePercent: 60 },
    { id: "t5", courseId: "c3", name: "بسام درويش", phone: phone(13), amountPaid: 250, paymentStatus: "installment" as const, attendancePercent: 0 },
  ];

  for (const tr of trainees) {
    await prisma.trainee.create({ data: tr });
  }

  // 14. Logins (Login Logs)
  console.log("Seeding login logs...");
  const loginAttempts = [
    { id: "l1", username: "admin", userId: "u1", at: d(0, -1), status: "success" as const, ip: "192.168.1.10", userAgent: "Mozilla/5.0" },
    { id: "l2", username: "sami", userId: "u2", at: d(0, -3), status: "success" as const, ip: "192.168.1.12", userAgent: "Mozilla/5.0" },
    { id: "l3", username: "unknown", userId: null, at: d(0, -5), status: "fail" as const, ip: "85.114.22.10", userAgent: "Mozilla/5.0" },
    { id: "l4", username: "noor", userId: "u3", at: d(1, -2), status: "success" as const, ip: "192.168.1.15", userAgent: "Mozilla/5.0" },
  ];

  for (const log of loginAttempts) {
    await prisma.loginLog.create({ data: log });
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
