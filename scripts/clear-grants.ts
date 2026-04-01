import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function clearGrants() {
  try {
    await prisma.$connect();
    console.log("Connected to database. Deleting all grant records...");

    const result = await prisma.grant.deleteMany({});

    console.log(`Successfully deleted ${result.count} grant record(s).`);
  } catch (error) {
    console.error("Error clearing grants:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log("Disconnected from database.");
  }
}

clearGrants();
