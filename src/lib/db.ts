import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** On a serverless host (Netlify, which runs on AWS Lambda) every running copy of the app opens its own pool. */
const serverless = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function createClient() {
  // One small pool for the whole server. Ten connections serve a school comfortably (a page sends a handful of
  // short queries); idle ones are closed, and a request waits a few seconds for a free one instead of hanging.
  // Serverless: two per copy, since many copies may run at once and share the database's connection limit.
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
