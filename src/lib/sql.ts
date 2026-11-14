import { Prisma } from "@/generated/prisma/client";

/**
 * Small helpers for the hand-written SQL that pages use to load everything in one round trip (the database is far
 * away: each query costs a round trip, and production has two connections).
 */

/** A JavaScript time as a timestamp column compares it (timestamps are stored in UTC, without a zone). */
export const utc = (d: Date) => Prisma.sql`(to_timestamp(${d.getTime() / 1000}) AT TIME ZONE 'UTC')`;

/** A timestamp column as milliseconds, so JSON carries it without the zone guesswork of a bare date string. */
export const ms = (col: Prisma.Sql) => Prisma.sql`(extract(epoch FROM ${col}) * 1000)::float8`;

/** A calendar day ("YYYY-MM-DD", as JSON gives DATE columns) back to the UTC-midnight Date the app uses for days. */
export const dayFromJson = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
