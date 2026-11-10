/**
 * Telegram bot integration. Needs TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME (from @BotFather);
 * without them every function is a no-op and the settings page explains how to switch reminders on.
 */
import { db } from "./db";

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_BOT_USERNAME;

export function botLink(code: string) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

export function appUrl(path = "") {
  return `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
}

export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => null);
  return !!res?.ok;
}

type Update = { message?: { chat: { id: number }; text?: string } };

/** Handles "/start CODE" from the bot link: connects the chat to the Lingify account that owns the code. */
export async function handleUpdate(update: Update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const match = msg.text.trim().match(/^\/start\s+([A-Za-z0-9]+)$/);
  if (!match) {
    await sendMessage(chatId, "Hello! To connect your Lingify account, open the link on your Lingify Settings page.");
    return;
  }
  const user = await db.user.findUnique({ where: { telegramCode: match[1] } });
  if (!user) {
    await sendMessage(chatId, "This link has expired. Please open a new one from your Lingify Settings page.");
    return;
  }
  await db.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: user.id } }, data: { telegramChatId: null } });
  await db.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramCode: null } });
  await sendMessage(
    chatId,
    user.role === "TEACHER"
      ? `Connected, ${escapeHtml(user.name)}! You will get a weekly summary of your classes here.`
      : `Connected, ${escapeHtml(user.name)}! I will remind you here when flashcards are due or a passage from your teacher is waiting.`,
  );
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function studentReminder(name: string, tasks: string[], overdue: string[]) {
  const lines = [
    `Hi ${escapeHtml(name.split(" ")[0])}! Still to do today:`,
    ...tasks.map((t) => `• ${escapeHtml(t)}`),
    ...(overdue.length ? ["", `⚠ Overdue: ${overdue.map(escapeHtml).join(", ")}`] : []),
    "",
    `Open Lingify: ${appUrl("/student")}`,
  ];
  return lines.join("\n");
}

export function teacherSummary(
  className: string,
  rows: { name: string; passages: number; cards: number; band: number | null; stuck: number }[],
) {
  const lines = [
    `<b>${escapeHtml(className)}</b>: last 7 days`,
    ...rows
      .sort((a, b) => b.stuck - a.stuck || a.passages - b.passages)
      .map((r) => `${r.stuck ? "⚠" : r.passages ? "✅" : "❌"} ${escapeHtml(r.name)}: ${r.passages} passage${r.passages === 1 ? "" : "s"}, ${r.cards} flashcards${r.band ? `, band ${r.band}` : ""}${r.stuck ? `, stuck on ${r.stuck} question${r.stuck === 1 ? "" : "s"}` : ""}`),
    "",
    `Details: ${appUrl("/teacher")}`,
  ];
  return lines.join("\n");
}
