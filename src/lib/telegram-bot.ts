import "server-only";
import { db } from "./db";
import { approveRequest, declineRequest, requestJoin, notifyTeacher } from "./enrollments";
import { blockedFor, clearFailures, recordFailure } from "./rate-limit";
import { answerCallback, appUrl, editMessage, escapeHtml, sendMessage, urlButton } from "./telegram";
import { answerWebLogin, claimWebLogin, linkLogin, mayLogIn, noteWebLogin } from "./telegram-login";

/**
 * What the bot does with each message and button press. Students sign up here (class code, then their name), log in
 * here (confirming a log-in started on the website, or /login for a one-time link) and get their reminders here.
 * Teachers who linked their Telegram approve or decline join requests with buttons.
 */

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
export type Update = {
  message?: { message_id: number; chat: { id: number; type?: string }; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number } } };
};

const CODE_TRIES = 5;
const CODE_WINDOW_MS = 10 * 60_000;

const accountOf = (chatId: string) =>
  db.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, name: true, role: true, telegramStep: true, enrollments: { select: { status: true, class: { select: { name: true, teacher: { select: { name: true } } } } } } },
  });
type Account = NonNullable<Awaited<ReturnType<typeof accountOf>>>;

const ASK_CODE =
  "Hi! I'm the Lingify bot. 👋\n\n<b>New to Lingify?</b> Send me your <b>class code</b>: the six letters your teacher gave you.\n\n" +
  "<b>Already have an account</b> (email and password)? Don't send the code, or you'll start again from zero. Log in on the website with your email, open <b>Settings → Connect Telegram</b>, and from then on you can log in here.";
const HELP = "Commands:\n/login: open Lingify\n/help: this message\n\nNew here? Send me your class code.";

function waitingText(a: Account) {
  const pending = a.enrollments.filter((e) => e.status === "PENDING");
  if (!pending.length) return ASK_CODE;
  const where = pending.map((e) => `<b>${escapeHtml(e.class.name)}</b> (${escapeHtml(e.class.teacher.name)})`).join(", ");
  return `Your request to join ${where} is waiting for your teacher. I'll message you here as soon as you're approved.`;
}

/** A fresh one-time link into Lingify, as a button where Telegram allows it. */
async function sendLoginLink(chatId: string, userId: string, name: string) {
  const link = await linkLogin(userId);
  const button = urlButton("Open Lingify", link);
  await sendMessage(chatId, `Hi ${escapeHtml(name.split(" ")[0] ?? name)}! ${button ? "Tap to open Lingify." : `Open Lingify: ${link}`}\n\nThe link works once, for 10 minutes.`, button ? [[button]] : undefined);
}

export async function handleUpdate(update: Update) {
  if (update.callback_query) return onButton(update.callback_query);
  const msg = update.message;
  // Private chats only: a code or a log-in in a group would be visible to everyone in it.
  if (!msg?.text || (msg.chat.type && msg.chat.type !== "private")) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const start = text.match(/^\/start(?:\s+(\S+))?$/);
  if (start?.[1]?.startsWith("login_")) return onWebLogin(chatId, start[1].slice("login_".length));
  if (start?.[1]) return onLinkCode(chatId, start[1], msg.from);
  if (start || text === "/login") return onHello(chatId);
  if (text === "/help") return sendMessage(chatId, HELP);
  return onText(chatId, text, msg.from);
}

/** /start or /login: a way in for approved accounts; otherwise what is still missing. */
async function onHello(chatId: string) {
  const a = await accountOf(chatId);
  if (!a) return sendMessage(chatId, ASK_CODE);
  if (a.telegramStep === "name") return sendMessage(chatId, "What is your <b>full name</b>, as your teacher knows you?");
  if (!(await mayLogIn(a.id))) return sendMessage(chatId, waitingText(a));
  return sendLoginLink(chatId, a.id, a.name);
}

/** The website asked this chat to confirm a log-in. */
async function onWebLogin(chatId: string, code: string) {
  const a = await accountOf(chatId);
  const row = await claimWebLogin(code, a && a.telegramStep !== "name" && (await mayLogIn(a.id)) ? a.id : null);
  if (!row) return sendMessage(chatId, "That log-in has expired or was opened somewhere else. Go back to Lingify and tap <b>Log in with Telegram</b> again.");
  if (!a || a.telegramStep === "name") {
    await noteWebLogin(row.id, "unknown");
    return sendMessage(chatId, a ? "What is your <b>full name</b>, as your teacher knows you?" : ASK_CODE);
  }
  if (!(await mayLogIn(a.id))) {
    await noteWebLogin(row.id, "pending");
    return sendMessage(chatId, waitingText(a));
  }
  await sendMessage(chatId, `Log in to Lingify as <b>${escapeHtml(a.name)}</b> on <b>${escapeHtml(row.device ?? "a browser")}</b>?\n\nOnly tap Yes if you just asked to log in on the website yourself. If someone sent you this link, tap No.`, [
    [
      { text: "✅ Yes, it's me", callback_data: `ok:${row.id}` },
      { text: "✖ No", callback_data: `no:${row.id}` },
    ],
  ]);
}

/** The older "Connect Telegram" link from the settings page: attaches this chat to an existing account. */
async function onLinkCode(chatId: string, code: string, from?: TgUser) {
  const user = await db.user.findUnique({ where: { telegramCode: code } });
  if (!user) return sendMessage(chatId, "This link has expired. Open a new one from your Lingify Settings page.");
  await db.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: user.id } }, data: { telegramChatId: null } });
  await db.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramCode: null, telegramUsername: from?.username ?? null } });
  await sendMessage(
    chatId,
    user.role === "TEACHER"
      ? `Connected, ${escapeHtml(user.name)}! You'll get your weekly class summary and join requests here.`
      : `Connected, ${escapeHtml(user.name)}! You can now log in with Telegram, and I'll remind you here when work is waiting.`,
  );
}

/** Any other text: the name we asked for, or a class code. */
async function onText(chatId: string, text: string, from?: TgUser) {
  const a = await accountOf(chatId);
  if (a?.telegramStep === "name") {
    const name = text.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 80 || name.startsWith("/")) return sendMessage(chatId, "Please send your full name (2 to 80 letters).");
    await db.user.update({ where: { id: a.id }, data: { name, telegramStep: null } });
    const pending = await db.enrollment.findMany({ where: { userId: a.id, status: "PENDING" }, select: { classId: true } });
    for (const e of pending) await notifyTeacher(e.classId, a.id);
    return sendMessage(chatId, `Thanks, ${escapeHtml(name.split(" ")[0]!)}! ${waitingText({ ...a, name })}`);
  }
  if (a && a.role === "TEACHER") return sendMessage(chatId, `Open Lingify: ${appUrl("/teacher")}`);
  if (a && (await mayLogIn(a.id)) && !/^[A-Za-z0-9]{6}$/.test(text)) return sendMessage(chatId, HELP);

  // A class code. Wrong guesses are limited per chat.
  const key = `tgcode:${chatId}`;
  const wait = blockedFor(key, CODE_TRIES);
  if (wait) return sendMessage(chatId, `Too many wrong codes. Wait ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""} and try again.`);
  const code = text.toUpperCase();
  const cls = /^[A-Z0-9]{6}$/.test(code) ? await db.class.findUnique({ where: { joinCode: code }, select: { id: true, name: true, teacher: { select: { name: true } } } }) : null;
  if (!cls) {
    recordFailure(key, CODE_WINDOW_MS);
    return sendMessage(chatId, a ? HELP : "I don't know that code. Check the six letters your teacher gave you and send them again.");
  }
  clearFailures(key);
  if (!a) {
    // A new student: their Telegram name for now, their real name next.
    const tgName = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim() || from?.username || "Student";
    const user = await db.user.create({ data: { role: "STUDENT", name: tgName.slice(0, 80), telegramChatId: chatId, telegramUsername: from?.username ?? null, telegramStep: "name" } });
    await requestJoin(user.id, cls.id);
    return sendMessage(chatId, `Found <b>${escapeHtml(cls.name)}</b> (${escapeHtml(cls.teacher.name)}). 👍\n\nWhat is your <b>full name</b>, as your teacher knows you?`);
  }
  const status = await requestJoin(a.id, cls.id);
  return sendMessage(
    chatId,
    status === "APPROVED" ? `You're already in <b>${escapeHtml(cls.name)}</b>. Send /login to open Lingify.` : `Request sent to ${escapeHtml(cls.teacher.name)} to join <b>${escapeHtml(cls.name)}</b>. I'll message you when you're approved.`,
  );
}

/** Button presses: confirming a website log-in, or a teacher answering a join request. */
async function onButton(q: NonNullable<Update["callback_query"]>) {
  const chatId = String(q.from.id);
  const [kind, ...rest] = (q.data ?? "").split(":");
  const reply = (text: string) => (q.message ? editMessage(String(q.message.chat.id), q.message.message_id, text) : sendMessage(chatId, text));

  if (kind === "ok" || kind === "no") {
    const a = await accountOf(chatId);
    const ok = !!a && (await mayLogIn(a.id)) && (await answerWebLogin(rest[0] ?? "", a.id, kind === "ok"));
    await answerCallback(q.id);
    if (!ok) return reply("That log-in has expired. Go back to Lingify and try again.");
    return reply(kind === "ok" ? "✅ You're logged in. Go back to your browser." : "OK, nobody was logged in. If you didn't ask to log in, you can ignore this.");
  }

  if (kind === "ap" || kind === "dn") {
    const [classId, userId] = rest;
    // Only the class's own teacher, from their own linked chat.
    const teacher = await db.user.findFirst({ where: { telegramChatId: chatId, role: "TEACHER", classesTaught: { some: { id: classId } } }, select: { id: true } });
    const student = await db.user.findUnique({ where: { id: userId ?? "" }, select: { name: true } });
    if (!teacher || !classId || !userId) return answerCallback(q.id, "Not allowed.");
    const done = kind === "ap" ? await approveRequest(teacher.id, classId, userId) : await declineRequest(teacher.id, classId, userId);
    await answerCallback(q.id, done ? (kind === "ap" ? "Approved" : "Declined") : "Already answered");
    if (done) await reply(`${kind === "ap" ? "✅ Approved" : "✖ Declined"}: ${escapeHtml(student?.name ?? "student")}`);
    return;
  }
  await answerCallback(q.id);
}
