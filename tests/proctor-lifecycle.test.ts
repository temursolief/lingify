import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The proctored first try against a real PostgreSQL database: an auto-finish (tab hidden, fullscreen exited) grades
 * the first try once, however many times it arrives (the action and the beacon together), moves the attempt into
 * the "Prove it" phase, and marks the homework. Also: concurrent retries never lose a try.
 *
 * Runs only with TEST_DATABASE_URL pointing at a throwaway database with the migrations applied
 * (`DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`). It refuses a Neon (hosted) database.
 */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && !/neon\.tech|amazonaws|supabase/.test(url);

describe.skipIf(!safe)("proctored first try (database)", () => {
  let lib: Awaited<ReturnType<typeof load>>;
  const tag = `proctor-${Date.now()}`;
  const ids = { teacher: "", students: [] as string[], passage: "", classId: "" };

  async function load() {
    process.env.DATABASE_URL = url;
    const [{ db }, passages, format, telemetry, listening, listeningFormat] = await Promise.all([
      import("../src/lib/db"),
      import("../src/lib/passages"),
      import("../src/lib/passage-format"),
      import("../src/lib/telemetry"),
      import("../src/lib/listening"),
      import("../src/lib/listening-format"),
    ]);
    return { db, ...passages, ...format, ...telemetry, submitListening: listening.submitListening, beginListeningTest: listening.beginListeningTest, retryListening: listening.retryListening, ...listeningFormat };
  }

  /** A student in the class with the passage assigned (strict lock), and their attempt, started on the server. */
  async function studentWithAttempt(name: string) {
    const student = await lib.db.user.create({ data: { email: `${name}-${tag}@test.local`, name, passwordHash: "x", role: "STUDENT" } });
    ids.students.push(student.id);
    await lib.db.enrollment.create({ data: { userId: student.id, classId: ids.classId } });
    await lib.db.assignment.create({ data: { classId: ids.classId, passageId: ids.passage, proctoringPolicy: "STRICT", requireVocabFirst: true, recipients: { create: [{ studentId: student.id }] } } });
    const keys = lib.answerKey(lib.passageSchema.parse(lib.EXAMPLE_PASSAGE).questionGroups);
    const attempt = await lib.db.passageAttempt.create({ data: { userId: student.id, passageId: ids.passage, total: keys.length } });
    await lib.beginTest(student.id, attempt.id);
    return { student, attempt, keys };
  }

  beforeAll(async () => {
    lib = await load();
    const data = lib.passageSchema.parse(lib.EXAMPLE_PASSAGE);
    const teacher = await lib.db.user.create({ data: { email: `t-${tag}@test.local`, name: "T", passwordHash: "x", role: "TEACHER" } });
    ids.teacher = teacher.id;
    ids.classId = (await lib.db.class.create({ data: { name: "C", joinCode: tag.slice(-6).toUpperCase(), teacherId: teacher.id } })).id;
    const passage = await lib.db.passage.create({
      data: { slug: tag, title: data.title, paragraphs: data.paragraphs, groups: data.questionGroups, timeLimit: data.timeLimit, ownerId: teacher.id, questionCount: lib.answerKey(data.questionGroups).length },
    });
    ids.passage = passage.id;
  });

  afterAll(async () => {
    if (!lib) return;
    await lib.db.listeningLesson.deleteMany({ where: { slug: tag } });
    await lib.db.passage.deleteMany({ where: { id: ids.passage } });
    await lib.db.user.deleteMany({ where: { id: { in: [ids.teacher, ...ids.students] } } });
    await lib.db.$disconnect();
  });

  for (const reason of ["TAB_HIDDEN", "FULLSCREEN_EXIT"] as const) {
    it(`${reason}: grades once, flags, and opens "Prove it"`, async () => {
      const { student, attempt, keys } = await studentWithAttempt(reason.toLowerCase());
      // Two questions answered (one right, one wrong) before leaving; the rest blank.
      const [first, second] = keys;
      const answers = { [first.number]: "TRUE", [second.number]: "NOT GIVEN" };
      const meta = { reason, events: [{ type: reason, atMs: 95_000 }], telemetry: lib.AttemptTelemetrySchema.parse({ answerTimes: { [first.number]: 40, [second.number]: 80 } }) };
      // The action and the beacon arrive together, then a late NORMAL submit from the page: only the first counts.
      await Promise.all([
        lib.submitFirst(student.id, attempt.id, answers, {}, 95, meta),
        lib.submitFirst(student.id, attempt.id, answers, {}, 95, meta),
      ]);
      await lib.submitFirst(student.id, attempt.id, { [first.number]: "FALSE" }, {}, 100, { ...meta, reason: "NORMAL" });

      const saved = await lib.db.passageAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { answers: true } });
      expect(saved.firstSubmittedAt).not.toBeNull();
      expect(saved.submissionReason).toBe(reason);
      expect(saved.integrityFlagged).toBe(true);
      expect(saved.integrityReasons).toContain(reason);
      expect(saved.answers).toHaveLength(keys.length);
      expect(saved.answers.filter((a) => a.answer === "")).toHaveLength(keys.length - 2);
      expect(saved.completedAt).toBeNull();

      const homework = await lib.db.assignmentRecipient.findFirstOrThrow({ where: { studentId: student.id } });
      expect(homework.firstSubmitAt).not.toBeNull();
      expect(homework.integrityFlagged).toBe(true);
      expect(homework.completedAt).toBeNull();

      // The "Prove it" phase is open: a blank question can be retried with evidence.
      const blank = saved.answers.find((a) => a.answer === "")!;
      const r = await lib.retryQuestion(student.id, attempt.id, blank.number, "TRUE", { paragraph: 0, start: 0, end: 10, text: "Some proof" });
      expect(r.ok).toBe(true);
    });
  }

  it("listening: a fullscreen exit grades once and opens corrections", async () => {
    // The example's answers are "FILL IN" placeholders, which the upload refuses: any real word will do here.
    const data = lib.listeningSchema.parse(JSON.parse(JSON.stringify(lib.EXAMPLE_LISTENING).replaceAll("FILL IN", "river")));
    const total = lib.answerKey(data.questionGroups).length;
    const lesson = await lib.db.listeningLesson.create({ data: { slug: tag, title: data.title, videoId: "abcdefghijk", questions: data.questionGroups, vocabulary: [], total } });
    const student = await lib.db.user.create({ data: { email: `listen-${tag}@test.local`, name: "L", passwordHash: "x", role: "STUDENT" } });
    ids.students.push(student.id);
    await lib.db.assignment.create({ data: { classId: ids.classId, lessonId: lesson.id, proctoringPolicy: "WARN_ONCE", recipients: { create: [{ studentId: student.id }] } } });
    const attempt = await lib.db.listeningAttempt.create({ data: { userId: student.id, lessonId: lesson.id } });
    await lib.beginListeningTest(student.id, attempt.id);
    const meta = { reason: "FULLSCREEN_EXIT" as const, events: [{ type: "FULLSCREEN_EXIT" as const, atMs: 60_000 }], telemetry: lib.AttemptTelemetrySchema.parse({ audioPauseCount: 3 }) };
    await Promise.all([lib.submitListening(student.id, attempt.id, {}, meta), lib.submitListening(student.id, attempt.id, {}, meta)]);
    await lib.submitListening(student.id, attempt.id, {}, { ...meta, reason: "NORMAL" });

    const saved = await lib.db.listeningAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(saved.submissionReason).toBe("FULLSCREEN_EXIT");
    expect(saved.integrityFlagged).toBe(true);
    expect(Object.keys(saved.answers as object)).toHaveLength(total);
    expect((saved.telemetry as { audioPauseCount?: number }).audioPauseCount).toBe(3);
    const homework = await lib.db.assignmentRecipient.findFirstOrThrow({ where: { studentId: student.id } });
    expect(homework).toMatchObject({ integrityFlagged: true, completedAt: null });
    // Corrections are open: a blank question can be checked again.
    const first = lib.answerKey(data.questionGroups)[0].number;
    expect(await lib.retryListening(student.id, attempt.id, first, "something")).toEqual({});
  });

  it("never loses a try when two checks arrive at once", async () => {
    const { student, attempt, keys } = await studentWithAttempt("race");
    await lib.submitFirst(student.id, attempt.id, {}, {}, 600, lib.SubmissionMetaSchema.parse({}));
    const n = keys[0].number;
    const proof = { paragraph: 0, start: 0, end: 10, text: "Some proof" };
    const results = await Promise.all(["FALSE", "NOT GIVEN", "FALSE"].map((answer) => lib.retryQuestion(student.id, attempt.id, n, answer, proof)));
    const row = await lib.db.questionAnswer.findUniqueOrThrow({ where: { attemptId_number: { attemptId: attempt.id, number: n } } });
    const history = row.history as { answer: string }[];
    // The duplicate "FALSE" is refused whichever order they ran in; nothing is overwritten.
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(history.map((h) => h.answer).slice(1).sort()).toEqual(["FALSE", "NOT GIVEN"]);
    expect(row.tries).toBe(3);
  });
});
