import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding hot drink definitions...");

  const defaultHotDrinks = [
    { name: "قهوة", price: 6 },
    { name: "نسكافيه", price: 5 },
    { name: "شاي", price: 3 },
    { name: "كابتشينو", price: 8 },
  ];

  for (const hd of defaultHotDrinks) {
    const existing = await prisma.hotDrink.findFirst({ where: { name: hd.name } });
    if (!existing) {
      await prisma.hotDrink.create({ data: hd });
      console.log(`Created hot drink: ${hd.name}`);
    } else {
      console.log(`Hot drink already exists: ${hd.name}`);
    }
  }

  console.log("Hot drink seeding completed.");
}

main()
  .catch((e) => {
    console.error("Error seeding hot drinks:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
