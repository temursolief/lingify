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
  { type: "summary", name: "Summary completion", fields: "the group has text with gaps {{12}}, maxWords, optional title; lines with | become a table (first line is the header)", answer: 'answers: ["luxury"]' },
];

/** What teachers read before preparing a passage file. The example below is validated by the same code as uploads. */
export default function FormatPage() {
  return (
    <>
      <PageHeader title="Passage format" action={<Link href="/teacher/passages" className="text-sm">My passages</Link>} />
      <div className="max-w-3xl space-y-4 text-[15px]">
        <Card>
          <p className="font-semibold">The file</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>title</Code></li>
            <li><Code>timeLimit</Code>: minutes, 5–60.</li>
            <li><Code>paragraphs</Code>: one string each (A, B, C…).</li>
            <li><Code>questionGroups</Code>: <Code>type</Code>, <Code>instructions</Code>, <Code>questions</Code>.</li>
            <li><Code>deck</Code> (optional): flashcards.</li>
          </ul>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Flashcards inside the file</p>
            <a href="/samples/passage-with-deck-example.json" download className="text-sm">Download example with flashcards</a>
          </div>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>deck.name</Code> (optional)</li>
            <li><Code>deck.cards</Code>: 1 to {MAX_DECK_CARDS} cards, either:</li>
          </ul>
          <ul className="mt-2 ml-5 list-[circle] space-y-1.5 pl-5">
            <li>
              <b>word</b>: <Code>word</Code>, <Code>meaning</Code>, optional <Code>example</Code> and <Code>uz</Code>. Each word once.
            </li>
            <li>
              <b>free</b>: <Code>front</Code>, <Code>back</Code> (text or simple HTML).
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted">Images or sounds: upload an .apkg instead.</p>
        </Card>
        <Card>
          <p className="font-semibold">Every question</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>number</Code>: unique (1, 2, 3…).</li>
            <li><Code>evidence</Code> (recommended): paragraph letter of the proof.</li>
            <li><Code>explanation</Code> (optional): shown after a correct answer.</li>
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
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{JSON.stringify(EXAMPLE_PASSAGE_WITH_DECK, null, 2)}</pre>
        </Card>
      </div>
    </>
  );
}
