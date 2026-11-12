import { z } from "zod";
import { currentUser, getSession } from "@/lib/auth";
import { lessonSubmissionSchema, passageSubmissionSchema, submitLessonFor, submitPassageFor } from "@/lib/submissions";

/**
 * The proctor's last word when a student leaves a test page for good (closes the tab, reloads, the phone locks):
 * `navigator.sendBeacon` delivers the same body as the Submit action even while the page is being torn down, so
 * whatever was answered up to that moment is graded. If the action got there first, this changes nothing.
 */
const schema = z.discriminatedUnion("kind", [
  passageSubmissionSchema.extend({ kind: z.literal("passage") }),
  lessonSubmissionSchema.extend({ kind: z.literal("lesson") }),
]);

export async function POST(request: Request) {
  const session = await getSession();
  const user = session ? await currentUser(session.userId) : null;
  if (!user || user.role !== "STUDENT") return new Response(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    if (parsed.data.kind === "passage") await submitPassageFor(user.id, parsed.data);
    else await submitLessonFor(user.id, parsed.data);
  } catch (error) {
    console.error("attempt-terminate failed", error);
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
