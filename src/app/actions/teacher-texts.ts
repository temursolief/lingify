"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { tokenize } from "@/lib/nlp";

export type TextFormState = { error?: string; ok?: string } | undefined;

const MAX_QUESTIONS = 5;

const schema = z.object({
  title: z.string().trim().min(3, "Give the text a title.").max(120),
  summary: z.string().trim().max(300).optional(),
  genre: z.enum(["Short story", "Non-fiction", "News", "Biography", "Science", "Mystery", "IELTS-style"]),
  body: z.string().trim().min(200, "The text is too short (at least 200 characters).").max(20_000),
});

function slugify(title: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${randomBytes(3).toString("hex")}`;
}

export async function createTeacherText(_: TextFormState, formData: FormData): Promise<TextFormState> {
  const teacher = await requireTeacher();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, summary, genre, body } = parsed.data;

  const paragraphTexts = body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const questions = [];
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const question = String(formData.get(`q${i}`) ?? "").trim();
    if (!question) continue;
    const options = [0, 1, 2, 3].map((j) => String(formData.get(`q${i}o${j}`) ?? "").trim()).filter(Boolean);
    const answer = Number(formData.get(`q${i}a`));
    if (options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      return { error: `Question ${i + 1} needs at least two options and a correct answer.` };
    }
    questions.push({ question, options, answer, explanation: "", skill: "detail" });
  }

  const { paragraphs, sentences, lemmaCounts, wordCount } = tokenize(paragraphTexts);
  await db.text.create({
    data: {
      slug: slugify(title),
      title,
      summary: summary || paragraphTexts[0].slice(0, 140) + (paragraphTexts[0].length > 140 ? "…" : ""),
      genre,
      topics: [],
      paragraphs,
      sentences,
      lemmaCounts,
      wordCount,
      questions,
      grammar: [],
      ownerId: teacher.id,
    },
  });
  refresh();
  return { ok: `Added “${title}” (${wordCount} words). Your students can now find it in their library, and you can assign it.` };
}

export async function deleteTeacherText(textId: string) {
  const teacher = await requireTeacher();
  await db.text.deleteMany({ where: { id: textId, ownerId: teacher.id } });
  refresh();
}
