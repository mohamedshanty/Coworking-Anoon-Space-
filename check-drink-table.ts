import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Direct Prisma Create Test ===");
  try {
    const drink = await prisma.drink.create({
      data: {
        name: "Test Drink Direct",
        quantity: 10,
        sellPrice: 5.0,
        costPrice: 3.0,
        lastRestockDate: new Date(),
        alertThreshold: 5,
      },
    });
    console.log("SUCCESS:", JSON.stringify(drink));
    await prisma.drink.delete({ where: { id: drink.id } });
  } catch (e: any) {
    console.error("FAILED:", e.message, e.code, e.meta);
  }

  console.log("\n=== Check SnackOrder drinkId column ===");
  try {
    const cols = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'SnackOrder' AND column_name = 'drinkId'"
    );
    console.log("drinkId column:", JSON.stringify(cols));
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }

  console.log("\n=== Check Drink table ===");
  try {
    const cols = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Drink' ORDER BY ordinal_position"
    );
    console.log("Drink columns:", JSON.stringify(cols, null, 2));
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }
}
main().finally(() => prisma.$disconnect());
