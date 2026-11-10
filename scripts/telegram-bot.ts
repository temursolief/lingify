/**
 * Local development only: polls Telegram for messages so students and teachers can connect their accounts
 * without a public webhook URL. In production, register /api/telegram/webhook with setWebhook instead.
 * Usage: npm run telegram:bot
 */
import "dotenv/config";
import { handleUpdate, telegramConfigured } from "../src/lib/telegram";

async function main() {
  if (!telegramConfigured()) {
    console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in .env first.");
    process.exit(1);
  }
  const api = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  await fetch(`${api}/deleteWebhook`);
  let offset = 0;
  console.log("Listening for Telegram messages… (Ctrl+C to stop)");
  for (;;) {
    const res = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { result?: (Parameters<typeof handleUpdate>[0] & { update_id: number })[] } | null;
    for (const update of body?.result ?? []) {
      offset = update.update_id + 1;
      await handleUpdate(update).catch((e) => console.error(e));
    }
    if (!res) await new Promise((r) => setTimeout(r, 5000));
  }
}

main();
