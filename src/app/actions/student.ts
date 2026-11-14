"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { requestJoin } from "@/lib/enrollments";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | undefined;

export async function joinClass(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the code your teacher gave you." };
  const cls = await db.class.findUnique({ where: { joinCode: code } });
  if (!cls) return { error: "No class found with that code." };

  // A request: the teacher approves it before the class shows up.
  const status = await requestJoin(user.id, cls.id);
  refresh();
  return { ok: status === "APPROVED" ? `You're already in ${cls.name}.` : `Request sent. You'll see ${cls.name} once your teacher approves you.` };
}

export async function setUzbekGlosses(on: boolean) {
  const user = await requireStudent();
  await db.user.update({ where: { id: user.id }, data: { uzbekGlosses: z.boolean().parse(on) } });
}

/** The band at the end of the student's band path: 5.0 to 9.0 in half bands. */
export async function setTargetBand(band: number) {
  const user = await requireStudent();
  const value = z.number().min(5).max(9).multipleOf(0.5).parse(band);
  await db.user.update({ where: { id: user.id }, data: { targetBand: value } });
  refresh();
}
