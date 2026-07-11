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
  await prisma.hotDrink.deleteMany({});

  console.log("Seeding minimal admin user...");

  // Create a single admin user for initial access
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.staff.create({
    data: {
      id: "u1",
      name: "المدير العام",
      username: "admin",
      role: "admin",
      passwordHash,
    },
  });

  // Create default settings
  await prisma.settings.create({
    data: {
      id: "default",
      hourlyRate: 10,
      fullDayPrice: 50,
      fullDayThresholdHours: 6,
      hotDrinksMonthlyCost: 400,
      company: {
        name: "مساحة العمل المشترك",
        phone: "",
        email: "",
        address: "",
      },
    },
  });

  // Seed default hot drink definitions
  const defaultHotDrinks = [
    { name: "قهوة", price: 6 },
    { name: "نسكافيه", price: 5 },
    { name: "شاي", price: 3 },
    { name: "كابتشينو", price: 8 },
  ];

  for (const hd of defaultHotDrinks) {
    await prisma.hotDrink.create({ data: hd });
  }

  // Seed default rooms
  const defaultRooms = ["قاعة الإدارة", "القاعة A", "القاعة B"];
  for (const name of defaultRooms) {
    await prisma.room.create({ data: { name } });
  }

  // Grant admin full permissions on all pages
  const pages = [
    "الرئيسية", "داخل المساحة", "السجل", "المشتركون", "السناكس", "المشروبات",
    "المخزون", "المصروفات", "المديونيات", "القاعات", "الدورات", "المتابعة",
    "التقارير", "الإعدادات", "جهات الاتصال",
  ];

  for (const page of pages) {
    await prisma.permission.create({
      data: { staffId: "u1", pageKey: page, canView: true, canEdit: true, canDelete: true },
    });
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
