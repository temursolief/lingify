import { handleUpdate } from "@/lib/telegram";

/** Telegram calls this when someone writes to the bot. Register it with setWebhook and the same secret token. */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response(null, { status: 401 });
  }
  await handleUpdate(await request.json().catch(() => ({})));
  return new Response(null, { status: 200 });
}
