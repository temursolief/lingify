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
      <PageHeader title="Listening format" action={<Link href="/teacher/listening" className="text-sm">Listening</Link>} />
      <div className="max-w-3xl space-y-4 text-[15px]">
        <Card>
          <p className="font-semibold">The file</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>title</Code></li>
            <li><Code>video</Code>: YouTube link.</li>
            <li><Code>questionGroups</Code>: questions with answers.</li>
            <li><Code>vocabulary</Code> (optional): <Code>word</Code>, <Code>meaning</Code>, optional <Code>uz</Code> and <Code>example</Code>.</li>
          </ul>
        </Card>
        <Card>
          <p className="font-semibold">Question types</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <Code>notes</Code>: <Code>text</Code>, one line each; <Code>## </Code> heading, <Code>* </Code> bullet, gap <Code>{"{{11}}"}</Code>.
            </li>
            <li><Code>completion</Code>: one gap each, <Code>___</Code>.</li>
            <li><Code>summary</Code> (gaps <Code>{"{{n}}"}</Code> in a paragraph), <Code>mcq</Code>, <Code>tfng</Code>, <Code>ynng</Code>.</li>
          </ul>
        </Card>
        <Card>
          <p className="font-semibold">Answers</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><Code>answers</Code>: every accepted version, e.g. <Code>{'["1.5 million", "one and a half million"]'}</Code>.</li>
            <li><Code>maxWords</Code>: word limit. <Code>{'"allowNumber": true'}</Code>: numbers don&apos;t count.</li>
          </ul>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Example</p>
            <a href="/samples/listening-example.json" download className="text-sm">Download example.json</a>
          </div>
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{JSON.stringify(EXAMPLE_LISTENING, null, 2)}</pre>
        </Card>
      </div>
    </>
  );
}
