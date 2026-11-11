import "server-only";
import { db } from "./db";

/** Marks a student's assignment(s) for this passage or lesson done, once they have finished it. */
export async function completeAssignments(userId: string, content: { passageId: string } | { lessonId: string }, at: Date) {
  await db.assignmentRecipient.updateMany({ where: { studentId: userId, completedAt: null, assignment: content }, data: { completedAt: at } });
}
