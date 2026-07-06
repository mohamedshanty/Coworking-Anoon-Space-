import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRaw`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'Session'
      AND column_name IN ('discountAmount', 'discountNote')
    ORDER BY column_name
  `;
  console.table(result);
  await prisma.$disconnect();
}

main();
