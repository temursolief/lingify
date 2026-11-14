import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { EXAMPLE_PASSAGE, EXAMPLE_PASSAGE_WITH_DECK, MAX_DECK_CARDS } from "@/lib/passage-format";

export const metadata: Metadata = { title: "Passage format" };

const Code = ({ children }: { children: string }) => <code className="rounded bg-paper px-1 py-0.5 font-mono text-[13px]">{children}</code>;

const TYPES: { type: string; name: string; fields: string; answer: string }[] = [
  { type: "tfng", name: "True / False / Not Given", fields: "statement", answer: '"TRUE", "FALSE" or "NOT GIVEN"' },
  { type: "ynng", name: "Yes / No / Not Given", fields: "statement", answer: '"YES", "NO" or "NOT GIVEN"' },
  { type: "mcq", name: "Multiple choice", fields: "question, options (2–6, without letters)", answer: 'the letter: "B"' },
  { type: "headings", name: "Matching headings", fields: "paragraph (letter); the group has headings (without numerals)", answer: 'roman numeral: "iii"' },
  { type: "matching", name: "Matching information", fields: "statement", answer: 'paragraph letter: "C"' },
  { type: "completion", name: "Sentence completion", fields: "text with the gap as ___ ; the group has maxWords", answer: 'answers: ["weaker"] (every accepted spelling)' },
  { type: "summary", name: "Summary completion", fields: "the group has text with gaps {{12}}, maxWords, optional title", answer: 'answers: ["luxury"]' },
];

/** What teachers read before preparing a passage file. The example below is validated by the same code as uploads. */
export default function FormatPage() {
  return (
    <>
      <PageHeader title="Passage format" subtitle="How to prepare a passage JSON file" action={<Link href="/teacher/passages" className="text-sm">My passages</Link>} />
      <div className="max-w-3xl space-y-4 text-[15px]">
        <Card>
          <p className="font-semibold">The file</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>title</Code>: the passage title.</li>
            <li><Code>timeLimit</Code>: minutes for the first try (5–60, usually 20).</li>
            <li><Code>paragraphs</Code>: the passage, one string per paragraph. They are labelled A, B, C… in this order.</li>
            <li><Code>questionGroups</Code>: groups of questions, each with a <Code>type</Code>, <Code>instructions</Code> and <Code>questions</Code>.</li>
            <li><Code>deck</Code> (optional): the passage&apos;s flashcards, see below.</li>
          </ul>
          <p className="mt-3 text-sm text-muted">
            Two shapes are accepted: the passage on its own, or the passage with a <Code>deck</Code>. Both upload the same way and
            can be mixed in one go.
          </p>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Flashcards inside the file</p>
            <a href="/samples/passage-with-deck-example.json" download className="text-sm">Download example with flashcards</a>
          </div>
          <p className="mt-2 text-sm text-muted">
            Add a <Code>deck</Code> and the passage is saved with its flashcards, ready for the students it is assigned to. No Anki export is needed.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>deck.name</Code> (optional): the deck&apos;s name; the passage title if left out.</li>
            <li><Code>deck.cards</Code>: 1 to {MAX_DECK_CARDS} cards. Each card is one of two kinds:</li>
          </ul>
          <ul className="mt-2 ml-5 list-[circle] space-y-1.5 pl-5">
            <li>
              <b>a word card</b>: <Code>word</Code> and <Code>meaning</Code>, and optionally <Code>example</Code> (a sentence that contains the word: the card
              then shows that sentence with the word blanked out) and <Code>uz</Code> (the Uzbek meaning). Each word only once.
            </li>
            <li>
              <b>a free card</b>: <Code>front</Code> and <Code>back</Code>, plain text or simple HTML (bold, lists, images from a web address). Scripts are removed.
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted">
            Need images or sounds stored with the cards, or already have a deck in Anki? Upload an .apkg on the passage instead (My passages → Flashcard deck).
          </p>
        </Card>
        <Card>
          <p className="font-semibold">Every question</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>number</Code>: the question number, as in the exam (1, 2, 3…). Each number only once.</li>
            <li><Code>evidence</Code> (recommended): the paragraph letter that proves the answer. Lingify then tells you whether a student looked in the wrong paragraph or misread the right one.</li>
            <li><Code>explanation</Code> (optional): shown only after the student finds the right answer.</li>
          </ul>
        </Card>
        <Card className="p-0">
          <p className="px-4 pt-4 font-semibold">Question types</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr><th className="px-4 py-2 font-normal">type</th><th className="py-2 pr-3 font-normal">Fields</th><th className="py-2 pr-4 font-normal">Answer</th></tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {TYPES.map((t) => (
                <tr key={t.type}>
                  <td className="px-4 py-2"><Code>{t.type}</Code><span className="block text-xs text-muted">{t.name}</span></td>
                  <td className="py-2 pr-3">{t.fields}</td>
                  <td className="py-2 pr-4">{t.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Complete example: the passage on its own</p>
            <a href="/samples/passage-example.json" download className="text-sm">Download example.json</a>
          </div>
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{JSON.stringify(EXAMPLE_PASSAGE, null, 2)}</pre>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Complete example: the passage with its flashcards</p>
            <a href="/samples/passage-with-deck-example.json" download className="text-sm">Download example with flashcards</a>
          </div>
          <p className="mt-2 text-sm text-muted">The same passage; only the <Code>deck</Code> at the end is new.</p>
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{JSON.stringify(EXAMPLE_PASSAGE_WITH_DECK, null, 2)}</pre>
        </Card>
      </div>
    </>
  );
}
