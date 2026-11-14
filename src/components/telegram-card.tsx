import { createTelegramCode, unlinkTelegram } from "@/app/actions/settings";
import { botLink, telegramConfigured } from "@/lib/telegram";
import { Button, Card } from "./ui";

export function TelegramCard({
  user,
  role,
  canDisconnect = true,
}: {
  user: { telegramChatId: string | null; telegramCode: string | null };
  role: "STUDENT" | "TEACHER";
  /** false for students who log in only with Telegram: disconnecting would leave them no way in */
  canDisconnect?: boolean;
}) {
  // Nothing to show students or teachers until the server has a bot.
  if (!telegramConfigured()) return null;
  const what = role === "STUDENT" ? "a reminder when today's plan is not finished, and log in with one tap" : "a weekly summary of your classes and join requests to approve";
  return (
    <Card>
      <p className="font-semibold">Telegram reminders</p>
      <p className="mt-1 text-muted">Get {what} in Telegram.</p>
      {user.telegramChatId ? (
        <form action={unlinkTelegram} className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-good">✓ Connected</span>
          {canDisconnect && <Button variant="secondary" type="submit">Disconnect</Button>}
        </form>
      ) : user.telegramCode ? (
        <div className="mt-3 space-y-2">
          <p>
            1. Open <a href={botLink(user.telegramCode)} target="_blank" rel="noreferrer" className="underline">this link</a> in Telegram and press <b>Start</b>.
          </p>
          <p className="text-sm text-muted">2. Come back and refresh this page. The link works once.</p>
        </div>
      ) : (
        <form action={createTelegramCode} className="mt-3">
          <Button type="submit">Connect Telegram</Button>
        </form>
      )}
    </Card>
  );
}
