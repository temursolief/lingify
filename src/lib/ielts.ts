export type TfngAnswer = "TRUE" | "FALSE" | "NOT GIVEN";

export type IeltsTask =
  | { type: "tfng"; instructions: string; items: { id: string; statement: string; answer: TfngAnswer; explanation: string }[] }
  | { type: "headings"; instructions: string; headings: string[]; items: { id: string; paragraph: number; answer: number; explanation: string }[] }
  | {
      type: "completion";
      instructions: string;
      maxWords: number;
      items: { id: string; before: string; after: string; answers: string[]; explanation: string }[];
    }
  | { type: "summary"; instructions: string; maxWords: number; text: string; items: { id: string; answers: string[]; explanation: string }[] };

export const TASK_LABEL: Record<IeltsTask["type"], string> = {
  tfng: "True / False / Not Given",
  headings: "Matching headings",
  completion: "Sentence completion",
  summary: "Summary completion",
};

/** The reading sub-skill each IELTS question type mostly tests, so IELTS answers feed the same skill profile. */
export const TASK_SKILL: Record<IeltsTask["type"], string> = {
  tfng: "detail",
  headings: "gist",
  completion: "detail",
  summary: "detail",
};

export const paragraphLetter = (i: number) => String.fromCharCode(65 + i);

/** Questions without answers or explanations, safe to send to the browser before the test is submitted. */
export function publicTasks(tasks: IeltsTask[]) {
  return tasks.map((t) => {
    switch (t.type) {
      case "tfng":
        return { ...t, items: t.items.map(({ id, statement }) => ({ id, statement })) };
      case "headings":
        return { ...t, items: t.items.map(({ id, paragraph }) => ({ id, paragraph })) };
      case "completion":
        return { ...t, items: t.items.map(({ id, before, after }) => ({ id, before, after })) };
      case "summary":
        return { ...t, items: t.items.map(({ id }) => ({ id })) };
    }
  });
}
export type PublicTask = ReturnType<typeof publicTasks>[number];

export function normalizeAnswer(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,;:!?"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export type QuestionResult = { id: string; type: IeltsTask["type"]; correct: boolean; given: string; expected: string; explanation: string };

export function gradeIelts(tasks: IeltsTask[], answers: Record<string, string>) {
  const results: QuestionResult[] = [];
  for (const task of tasks) {
    for (const item of task.items) {
      const given = (answers[item.id] ?? "").trim();
      let correct = false;
      let expected = "";
      if (task.type === "tfng") {
        const it = item as Extract<IeltsTask, { type: "tfng" }>["items"][number];
        expected = it.answer;
        correct = given.toUpperCase() === it.answer;
      } else if (task.type === "headings") {
        const it = item as Extract<IeltsTask, { type: "headings" }>["items"][number];
        expected = task.headings[it.answer];
        correct = given === String(it.answer);
      } else {
        const it = item as { answers: string[] };
        expected = it.answers[0];
        const words = normalizeAnswer(given).split(" ").filter(Boolean);
        correct = words.length > 0 && words.length <= task.maxWords && it.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(given));
      }
      results.push({ id: item.id, type: task.type, correct, given, expected, explanation: item.explanation });
    }
  }
  const byType: Record<string, { correct: number; total: number }> = {};
  for (const r of results) {
    byType[r.type] ??= { correct: 0, total: 0 };
    byType[r.type].total++;
    if (r.correct) byType[r.type].correct++;
  }
  const correct = results.filter((r) => r.correct).length;
  return { results, correct, total: results.length, byType, band: estimateBand(correct, results.length) };
}

/** Raw score out of 40 → band, following the published IELTS Academic Reading conversion. */
const BAND_TABLE: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2],
];

/** One passage is a third of a real test, so its score is scaled to 40 before converting: an estimate, not a real band. */
export function estimateBand(correct: number, total: number) {
  const raw = total ? Math.round((correct / total) * 40) : 0;
  return BAND_TABLE.find(([min]) => raw >= min)![1];
}
