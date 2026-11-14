/**
 * Telegram Bot API helpers and message texts. Needs TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME (from @BotFather);
 * without them every call is a no-op. What the bot does with incoming messages is in telegram-bot.ts.
 */

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_BOT_USERNAME;

export function botLink(code: string) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

/** The site's address for links in messages. Netlify sets URL to the production address when APP_URL is missing. */
export function appUrl(path = "") {
  return `${(process.env.APP_URL || process.env.URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

export type Button = { text: string; callback_data?: string; url?: string };

/**
 * Calls the Bot API. With TELEGRAM_DRY_RUN=1 nothing is sent: the call is printed instead, so the bot can be tried
 * locally with simulated updates without touching the real bot or its webhook.
 */
async function callApi(method: string, body: Record<string, unknown>): Promise<boolean> {
  if (process.env.TELEGRAM_DRY_RUN === "1") {
    console.log(`[telegram:${method}]`, JSON.stringify(body));
    return true;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return !!res?.ok;
}

const keyboard = (buttons?: Button[][]) => (buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {});

export function sendMessage(chatId: string, text: string, buttons?: Button[][]): Promise<boolean> {
  return callApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...keyboard(buttons) });
}

/** Replaces a message the bot sent, e.g. a question whose buttons were just pressed. */
export function editMessage(chatId: string, messageId: number, text: string, buttons?: Button[][]): Promise<boolean> {
  return callApi("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, ...keyboard(buttons) });
}

/** Stops the spinner on a pressed button, optionally with a short toast. */
export function answerCallback(callbackId: string, text?: string): Promise<boolean> {
  return callApi("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** A button that opens a web page. Telegram refuses non-HTTPS addresses (local development), so those become null. */
export function urlButton(text: string, url: string): Button | null {
  return url.startsWith("https://") ? { text, url } : null;
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
