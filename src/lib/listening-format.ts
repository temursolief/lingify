import { z } from "zod";
import { checkGroups, parseJson, questionGroup, youtubeId } from "./passage-format";

/**
 * The JSON a teacher uploads for a Listening Comprehension lesson. One file becomes one lesson page:
 * the video, the questions (same question types as reading, minus the paragraph ones) and the key vocabulary.
 */

const vocabItem = z.object({
  word: z.string().min(1).max(80),
  meaning: z.string().min(1).max(300),
  /** optional Uzbek translation */
  uz: z.string().max(200).optional(),
  /** optional sentence from the video; on the student's flashcard the word is blanked out in it */
  example: z.string().max(400).optional(),
});

export const listeningSchema = z
  .object({
    title: z.string().min(1).max(160),
    video: z.string().min(1).max(300).refine((v) => youtubeId(v) !== null, "Use a YouTube link such as https://www.youtube.com/watch?v=…"),
    questionGroups: z.array(questionGroup).min(1),
    vocabulary: z.array(vocabItem).max(60).default([]),
  })
  .superRefine((p, ctx) => {
    p.questionGroups.forEach((g, gi) => {
      if (g.type === "headings" || g.type === "matching") {
        ctx.addIssue({ code: "custom", path: ["questionGroups", gi, "type"], message: `"${g.type}" needs paragraphs, so it is for reading only` });
      }
    });
    checkGroups(p.questionGroups, ctx, null);
  });

export type ListeningInput = z.input<typeof listeningSchema>;
export type ListeningData = z.output<typeof listeningSchema>;
export type VocabItem = z.output<typeof vocabItem>;

export const parseListeningJson = (raw: string) => parseJson(raw, listeningSchema);

/**
 * The example on the Format guide, from a TED-Ed lesson. Answers are placeholders on purpose: the teacher fills them
 * in from their answer key, and an upload is refused until every one is replaced.
 */
const FILL = ["FILL IN"];

export const EXAMPLE_LISTENING: ListeningInput = {
  title: "Ugly History: The Armenian Genocide (Ümit Kurt, TED-Ed)",
  video: "https://www.youtube.com/watch?v=DXgrI8GlUB8",
  questionGroups: [
    {
      type: "notes",
      instructions: "Listen the first time. Complete the notes below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
      maxWords: 2,
      allowNumber: true,
      title: "Armenians in the Ottoman Empire",
      text: [
        "## Before 1900",
        "* In 1878, Armenian activists agreed a {{11}} that promised changes, but the sultan did not keep his word.",
        "* The massacres of 1894-1896 came after centuries of Armenian {{12}}.",
        "## Early history",
        "* Over the following {{13}} years, Armenia was ruled by different local and foreign leaders.",
        "* The empire treated Muslims better, which made life hard for Armenians, Jews and {{14}}.",
        "## Resistance and war",
        "* Two groups from Russia gave a safe place to {{15}} and supplied weapons to villages.",
        "* During the First Balkan War, newcomers sent to Anatolia increased {{16}} between Christians and Muslims.",
        "## The genocide",
        "* By {{17}}, the Ottomans were using more violence against their own Armenian citizens than against any foreign enemy.",
        "* Most Armenians were forced to walk to camps in the Syrian {{18}}.",
        "* When most of the killings ended, the Armenian population of the empire had fallen to roughly {{19}}.",
        "## Today",
        "* In recent years, some Turkish {{20}} have rejected the government’s official position.",
      ].join("\n"),
      questions: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((number) => ({ number, answers: FILL })),
    },
    {
      type: "completion",
      instructions: "Listen the second time. Complete the sentences below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
      maxWords: 2,
      allowNumber: true,
      questions: [
        "The Hamidian Massacres killed more than ___ Armenians.",
        "The Armenians were originally a group of tribes living in the ___ of Western Asia.",
        "Christianity became an important part of the Armenians’ ethnic ___.",
        "The growing influence of educated Armenians in banking and government caused ___ among many Muslim Ottomans.",
        "After the sultan was removed in 1909, the new government also failed to pass meaningful ___.",
        "When Enver Pasha sent his troops on a difficult route to attack Russian forces, the whole unit ___ to death.",
        "Talaat Pasha ordered the removal of all Armenians from eastern Anatolia, saying it was necessary for ___.",
        "Armenian children who escaped were placed in ___, where they were taught Muslim culture and traditions.",
        "The modern nation of Armenia became independent in ___.",
        "Armenian organisations continue to campaign for the ___ of the genocide.",
      ].map((text, i) => ({ number: 31 + i, text, answers: FILL })),
    },
  ],
  vocabulary: [
    { word: "massacre", meaning: "the killing of a large number of people who cannot defend themselves", example: "The massacres of 1894-1896 came after centuries of Armenian persecution." },
    { word: "persecution", meaning: "cruel and unfair treatment of a group, especially because of their religion or race" },
    { word: "deport", meaning: "to force someone to leave a place or country" },
    { word: "uprising", meaning: "an occasion when a group of people fight against the people in power" },
    { word: "deny", meaning: "to say that something is not true or did not happen" },
  ],
};
