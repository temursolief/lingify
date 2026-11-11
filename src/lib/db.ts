import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** On Netlify (AWS Lambda underneath) every running copy of the app opens its own pool. */
const serverless = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function createClient() {
  // Two connections per copy on Netlify, since many copies may run at once and share the database's limit; ten for
  // the local server. Idle ones are closed, and a request waits a few seconds for a free one instead of hanging.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX) || (serverless ? 2 : 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
