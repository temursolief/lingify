"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createTelegramCode() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { telegramCode: randomBytes(9).toString("base64url").replace(/[-_]/g, "x") } });
  refresh();
}

export async function unlinkTelegram() {
  const user = await requireUser();
  // Telegram is the only way in for a student without a password: keep it connected.
  await db.user.updateMany({ where: { id: user.id, OR: [{ role: "TEACHER" }, { passwordHash: { not: null } }] }, data: { telegramChatId: null, telegramCode: null } });
  refresh();
}
