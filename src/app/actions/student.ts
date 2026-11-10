"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | undefined;

export async function joinClass(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the code your teacher gave you." };
  const cls = await db.class.findUnique({ where: { joinCode: code } });
  if (!cls) return { error: "No class found with that code." };

  await db.enrollment.upsert({
    where: { userId_classId: { userId: user.id, classId: cls.id } },
    create: { userId: user.id, classId: cls.id },
    update: {},
  });
  refresh();
  return { ok: `You joined ${cls.name}.` };
}

export async function setUzbekGlosses(on: boolean) {
  const user = await requireStudent();
  await db.user.update({ where: { id: user.id }, data: { uzbekGlosses: z.boolean().parse(on) } });
}
