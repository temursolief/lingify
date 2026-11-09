"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { answerQuestion, answerVocab, type AnswerFeedback } from "@/app/actions/reading";
import { ActivityTracker } from "@/components/activity-tracker";
import { Badge, Button, ButtonLink, Card, ProgressBar, cx } from "@/components/ui";
import type { VocabItem } from "@/lib/exercises";

type Choice = { question: string; options: string[] };
type Grammar = { structure: string; explanation: string; example: string; question: string; options: string[] };
type Section = "comprehension" | "vocab" | "grammar" | "done";

type Props = {
  sessionId: string;
  title: string;
  wpm: number | null;
  minutes: number;
  optional: boolean;
  questions: Choice[];
  grammar: Grammar[];
  vocab: VocabItem[];
  next: { slug: string; title: string } | null;
};

const ACTIVITY = { comprehension: "QUIZ", vocab: "VOCAB", grammar: "GRAMMAR" } as const;

export function Practice({ sessionId, title, wpm, minutes, optional, questions, grammar, vocab, next }: Props) {
  const sections = (["comprehension", "vocab", "grammar"] as const).filter(
    (s) => (s === "comprehension" && questions.length) || (s === "vocab" && vocab.length) || (s === "grammar" && grammar.length),
  );
  const [section, setSection] = useState<Section>(sections[0] ?? "done");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ comprehension: 0, vocab: 0, grammar: 0 });

  const advance = (correct: boolean) => {
    if (section === "done") return;
    if (correct) setScore((s) => ({ ...s, [section]: s[section] + 1 }));
  };
  const nextItem = (count: number) => {
    if (section === "done") return;
    if (index + 1 < count) {
      setIndex(index + 1);
      return;
    }
    const pos = sections.indexOf(section);
    setSection(sections[pos + 1] ?? "done");
    setIndex(0);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {section !== "done" && <ActivityTracker key={section} activity={ACTIVITY[section]} />}
      <div className="mb-6">
        <p className="text-sm text-muted">After reading</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="good">Finished in {minutes} min</Badge>
          {wpm && <Badge>{wpm} words per minute</Badge>}
        </div>
      </div>

      {optional && section !== "done" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft p-4 text-sm text-good">
          <span>This was a pleasure read, so the exercises are optional.</span>
          <Button variant="secondary" onClick={() => setSection("done")}>Skip to the end</Button>
        </div>
      )}

      {section !== "done" && (
        <nav className="mb-4 flex gap-2 text-sm" aria-label="Practice steps">
          {sections.map((s) => (
            <span key={s} className={cx("rounded-full px-3 py-1", s === section ? "bg-accent-soft font-medium text-accent" : "text-muted")}>
              {s === "comprehension" ? "Understanding" : s === "vocab" ? "Words" : "Grammar"}
            </span>
          ))}
        </nav>
      )}

      {section === "comprehension" && (
        <MultipleChoice
          key={`q${index}`}
          progress={(index + 1) / questions.length}
          label={`Question ${index + 1} of ${questions.length}`}
          question={questions[index].question}
          options={questions[index].options}
          check={(choice) => answerQuestion({ sessionId, kind: "COMPREHENSION", index, choice })}
          onAnswered={advance}
          onNext={() => nextItem(questions.length)}
        />
      )}

      {section === "vocab" && (
        <VocabQuestion
          key={`v${index}`}
          progress={(index + 1) / vocab.length}
          label={`Word ${index + 1} of ${vocab.length}`}
          item={vocab[index]}
          check={(choice) => answerVocab({ sessionId, lemma: vocab[index].lemma, choice })}
          onAnswered={advance}
          onNext={() => nextItem(vocab.length)}
        />
      )}

      {section === "grammar" && (
        <div className="space-y-4">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-accent">Grammar in the text</p>
            <h2 className="mt-1 text-lg font-semibold">{grammar[index].structure}</h2>
            <blockquote className="mt-3 border-l-4 border-accent pl-4 font-serif text-lg">{grammar[index].example}</blockquote>
            <p className="mt-3 text-muted">{grammar[index].explanation}</p>
          </Card>
          <MultipleChoice
            key={`g${index}`}
            progress={(index + 1) / grammar.length}
            label={`Practice ${index + 1} of ${grammar.length}`}
            question={grammar[index].question}
            options={grammar[index].options}
            check={(choice) => answerQuestion({ sessionId, kind: "GRAMMAR", index, choice })}
            onAnswered={advance}
            onNext={() => nextItem(grammar.length)}
          />
        </div>
      )}

      {section === "done" && (
        <Card className="text-center">
          <p className="text-4xl" aria-hidden>🎉</p>
          <h2 className="mt-2 text-xl font-semibold">Well done!</h2>
          <ul className="mt-4 space-y-1 text-muted">
            {questions.length > 0 && <li>Understanding: {score.comprehension} of {questions.length} correct</li>}
            {vocab.length > 0 && <li>Words: {score.vocab} of {vocab.length} correct</li>}
            {grammar.length > 0 && <li>Grammar: {score.grammar} of {grammar.length} correct</li>}
          </ul>
          <p className="mt-4 text-sm text-muted">The words you looked up will come back in your review, just before you would forget them.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {next && <ButtonLink href={`/student/read/${next.slug}`}>Next: {next.title}</ButtonLink>}
            <ButtonLink href="/student/library" variant="secondary">Back to library</ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}

function MultipleChoice({
  label, progress, question, options, check, onAnswered, onNext,
}: {
  label: string;
  progress: number;
  question: string;
  options: string[];
  check: (choice: number) => Promise<AnswerFeedback>;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [pending, start] = useTransition();

  const pick = (i: number) =>
    start(async () => {
      setChosen(i);
      const f = await check(i);
      setFeedback(f);
      onAnswered(f.correct);
    });

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <span className="whitespace-nowrap">{label}</span>
        <ProgressBar value={progress} label={label} />
      </div>
      <h2 className="text-lg font-medium">{question}</h2>
      <div className="mt-4 space-y-2">
        {options.map((option, i) => {
          const isAnswer = feedback && i === feedback.answer;
          const isWrongPick = feedback && i === chosen && !feedback.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={!!feedback || pending}
              onClick={() => pick(i)}
              className={cx(
                "block w-full rounded-lg border px-4 py-3 text-left transition",
                isAnswer ? "border-good bg-good-soft text-good" : isWrongPick ? "border-bad bg-bad-soft text-bad" : "border-line hover:border-muted",
                pending && chosen === i && "opacity-60",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {feedback && (
        <div className="mt-4" aria-live="polite">
          <p className={cx("font-medium", feedback.correct ? "text-good" : "text-bad")}>{feedback.correct ? "Correct!" : "Not quite."}</p>
          <p className="mt-1 text-muted">{feedback.explanation}</p>
          <Button className="mt-4" onClick={onNext} autoFocus>Continue</Button>
        </div>
      )}
    </Card>
  );
}

function VocabQuestion({
  label, progress, item, check, onAnswered, onNext,
}: {
  label: string;
  progress: number;
  item: VocabItem;
  check: (choice: string) => Promise<{ correct: boolean; answer: string }>;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; answer: string } | null>(null);
  const [pending, start] = useTransition();
  const [before, after] = item.gapped.split("_____");

  const pick = (option: string) =>
    start(async () => {
      setChosen(option);
      const r = await check(option);
      setResult(r);
      onAnswered(r.correct);
    });

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <span className="whitespace-nowrap">{label}</span>
        <ProgressBar value={progress} label={label} />
      </div>
      <p className="text-sm text-muted">Which word completes the sentence from the text?</p>
      <p className="mt-3 font-serif text-xl leading-relaxed">
        {before}
        <span className={cx("mx-1 inline-block min-w-20 border-b-2 px-1 text-center", result ? (result.correct ? "border-good text-good" : "border-bad text-bad") : "border-accent")}>
          {result ? result.answer : " "}
        </span>
        {after}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {item.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!!result || pending}
            onClick={() => pick(option)}
            className={cx(
              "rounded-lg border px-4 py-3 font-medium transition",
              result && option.toLowerCase() === result.answer.toLowerCase()
                ? "border-good bg-good-soft text-good"
                : result && option === chosen
                  ? "border-bad bg-bad-soft text-bad"
                  : "border-line hover:border-muted",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {result && (
        <div className="mt-4" aria-live="polite">
          <p className={cx("font-medium", result.correct ? "text-good" : "text-bad")}>
            {result.correct ? "Correct!" : `The answer is “${result.answer}”.`}
          </p>
          <Button className="mt-3" onClick={onNext} autoFocus>Continue</Button>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        <Link href="/student/words" className="underline">See all your words</Link>
      </p>
    </Card>
  );
}
