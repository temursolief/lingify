import "server-only";
import { revalidateTag } from "next/cache";
import { db } from "./db";
import { linkLogin } from "./telegram-login";
import { escapeHtml, sendMessage, urlButton } from "./telegram";

/**
 * Joining a class is a request: the student asks with the class code (on the website or in the bot), and the
 * teacher approves or declines it, on the class page, on Today, or with the buttons the bot sends them. Only an
 * approved student can log in or appear in the class's lists, leagues and homework.
 */

/** The Today count beside the teacher's name includes requests: refresh it now, if this runs inside the app. */
function refreshTeacherBadge(teacherId: string) {
  try {
    revalidateTag(`teacher-badge:${teacherId}`, { expire: 0 });
  } catch {
    // Outside a request (the local bot poller): the count catches up within the minute.
  }
}

/** Asks to join. Nothing changes if the student already asked or is already in. Tells the teacher on Telegram. */
export async function requestJoin(userId: string, classId: string) {
  const existing = await db.enrollment.findUnique({ where: { userId_classId: { userId, classId } }, select: { status: true } });
  if (existing) return existing.status;
  await db.enrollment.create({ data: { userId, classId, status: "PENDING" } });
  await notifyTeacher(classId, userId);
  return "PENDING" as const;
}

/** The teacher's Telegram, if linked: who asked, with Approve and Decline buttons. */
export async function notifyTeacher(classId: string, userId: string) {
  const [cls, student] = await Promise.all([
    db.class.findUnique({ where: { id: classId }, select: { name: true, teacherId: true, teacher: { select: { telegramChatId: true } } } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true, telegramUsername: true, telegramStep: true } }),
  ]);
  if (!cls || !student) return;
  refreshTeacherBadge(cls.teacherId);
  // Wait until the student has given their real name: the teacher should know whom they are approving.
  if (!cls.teacher.telegramChatId || student.telegramStep === "name") return;
  const who = `${escapeHtml(student.name)}${student.telegramUsername ? ` (@${escapeHtml(student.telegramUsername)})` : ""}`;
  await sendMessage(cls.teacher.telegramChatId, `🙋 ${who} wants to join <b>${escapeHtml(cls.name)}</b>.`, [
    [
      { text: "✅ Approve", callback_data: `ap:${classId}:${userId}` },
      { text: "✖ Decline", callback_data: `dn:${classId}:${userId}` },
    ],
  ]);
}

/** Approves a waiting request in one of this teacher's classes. The student gets a message with a way in. */
export async function approveRequest(teacherId: string, classId: string, userId: string) {
  const done = await db.enrollment.updateMany({
    where: { classId, userId, status: "PENDING", class: { teacherId } },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
  if (!done.count) return false;
  refreshTeacherBadge(teacherId);
  const [student, cls] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, name: true } }),
    db.class.findUnique({ where: { id: classId }, select: { name: true } }),
  ]);
  if (student?.telegramChatId) {
    const link = await linkLogin(userId);
    const button = urlButton("Open Lingify", link);
    await sendMessage(
      student.telegramChatId,
      `🎉 You're in <b>${escapeHtml(cls?.name ?? "your class")}</b>, ${escapeHtml(student.name.split(" ")[0] ?? "")}!` +
        (button ? "" : `\n\nOpen Lingify: ${link}`) +
        `\n\nAny time later, send /login here to open Lingify.`,
      button ? [[button]] : undefined,
    );
  }
  return true;
}

/** Declines a waiting request: the request is removed and the student told. */
export async function declineRequest(teacherId: string, classId: string, userId: string) {
  const done = await db.enrollment.deleteMany({ where: { classId, userId, status: "PENDING", class: { teacherId } } });
  if (!done.count) return false;
  refreshTeacherBadge(teacherId);
  const [student, cls] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } }),
    db.class.findUnique({ where: { id: classId }, select: { name: true } }),
  ]);
  if (student?.telegramChatId) {
    await sendMessage(student.telegramChatId, `Your request to join <b>${escapeHtml(cls?.name ?? "the class")}</b> was not accepted. If this is a mistake, ask your teacher and send the class code again.`);
  }
  return true;
}

