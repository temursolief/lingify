import { handleUpdate } from "@/lib/telegram-bot";

/** Telegram calls this when someone writes to the bot. Register it with setWebhook and the same secret token. */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response(null, { status: 401 });
  }
  try {
    await handleUpdate(await request.json().catch(() => ({})));
  } catch (error) {
    // Answer 200 anyway: an error status makes Telegram resend the same update again and again, repeating every
    // message the bot already sent for it.
    console.error("[telegram webhook]", error);
  }
  return new Response(null, { status: 200 });
}
