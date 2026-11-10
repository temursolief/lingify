import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { EXAMPLE_LISTENING } from "@/lib/listening-format";

export const metadata: Metadata = { title: "Listening format" };

const Code = ({ children }: { children: string }) => <code className="rounded bg-paper px-1 py-0.5 font-mono text-[13px]">{children}</code>;

/** What teachers read before preparing a listening lesson file. */
export default function ListeningFormatPage() {
  return (
    <>
      <PageHeader title="Listening format" subtitle="How to prepare a listening lesson JSON file" action={<Link href="/teacher/listening" className="text-sm">Listening</Link>} />
      <div className="mx-auto max-w-3xl space-y-4 text-[15px]">
        <Card>
          <p className="font-semibold">The file</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>title</Code>: the lesson title students see.</li>
            <li><Code>video</Code>: the YouTube link (watch, share or embed link).</li>
            <li><Code>questionGroups</Code>: the questions with their answers.</li>
            <li><Code>vocabulary</Code> (optional): key words, each with <Code>word</Code>, <Code>meaning</Code>, and optionally <Code>uz</Code> and an <Code>example</Code> sentence from the video. Students can add them all to their flashcards in one click; the word is blanked out in the example on the card.</li>
          </ul>
        </Card>
        <Card>
          <p className="font-semibold">Question types</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <Code>notes</Code>: note completion. Put the notes in <Code>text</Code>, one line each: start a heading with <Code>## </Code>,
              a bullet with <Code>* </Code>, and write each gap as <Code>{"{{11}}"}</Code>.
            </li>
            <li><Code>completion</Code>: sentences with one gap each, written as <Code>___</Code>.</li>
            <li><Code>summary</Code> (gaps <Code>{"{{n}}"}</Code> in a paragraph), <Code>mcq</Code>, <Code>tfng</Code>, <Code>ynng</Code>.</li>
          </ul>
        </Card>
        <Card>
          <p className="font-semibold">Answers</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>answers</Code> lists every accepted version, e.g. <Code>{'["1.5 million", "one and a half million"]'}</Code>. Capitals, “the/a/an” and full stops are ignored.</li>
            <li><Code>maxWords</Code> is the word limit. For “NO MORE THAN TWO WORDS AND/OR A NUMBER” add <Code>{'"allowNumber": true'}</Code>: a number does not count as a word.</li>
            <li>Students never see the answers. A wrong answer stays red until they listen again and find it.</li>
          </ul>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">TED-Ed example (answers still to fill in)</p>
            <a href="/samples/listening-example.json" download className="text-sm">Download example.json</a>
          </div>
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{JSON.stringify(EXAMPLE_LISTENING, null, 2)}</pre>
        </Card>
      </div>
    </>
  );
}
