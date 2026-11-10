"use client";

import { useState, useTransition, type ReactNode } from "react";
import { answerItem, answerVocab, rateText, savePhrase } from "@/app/actions/reading";
import { ActivityTracker } from "@/components/activity-tracker";
import { ChoiceQuestion, feedbackLine } from "@/components/choice-question";
import { Badge, Button, ButtonLink, Card, ProgressBar, cx } from "@/components/ui";
import type { VocabItem } from "@/lib/exercises";

type Choice = { question: string; options: string[] };
type GrammarItem = {
  structure: string;
  explanation: string;
  examples: string[];
  highlights: string[];
  discovery: Choice;
  exercise: Choice;
  preview: boolean;
  stageLabel: string;
};
type PhraseItem = Choice & {
  index: number;
  phrase: string;
  inText: string;
  meaning: string;
  uz: string | null;
  sentence: string;
  collocation: (Choice & { hint: string }) | null;
};
type Rating = { enjoyment: number; difficulty: number; recommend: boolean };

type Props = {
  sessionId: string;
  textId: string;
  title: string;
  wpm: number | null;
  minutes: number;
  optional: boolean;
  lookBack: string[];
  gist: Choice | null;
  prediction: { question: string; chosen: string | null; actual: string } | null;
  questions: (Choice & { skill: string })[];
  vocab: VocabItem[];
  phrases: PhraseItem[];
  grammar: GrammarItem[];
  grammarStage: number;
  uzbek: boolean;
  response: string;
  rating: Rating | null;
  next: { slug: string; title: string; inSeries: boolean } | null;
};

const SECTIONS = ["gist", "detail", "words", "phrases", "grammar", "response", "done"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = {
  gist: "Main idea",
  detail: "Details",
  words: "Words",
  phrases: "Phrases",
  grammar: "Grammar",
  response: "Your view",
  done: "Finish",
};
const ACTIVITY = { gist: "QUIZ", detail: "QUIZ", words: "VOCAB", phrases: "VOCAB", grammar: "GRAMMAR", response: "QUIZ" } as const;

function highlightText(sentence: string, highlights: string[]) {
  const parts: ReactNode[] = [];
  let rest = sentence;
  let key = 0;
  while (rest) {
    let best: { at: number; h: string } | null = null;
    for (const h of highlights) {
      const at = rest.indexOf(h);
      if (at !== -1 && (!best || at < best.at)) best = { at, h };
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, best.at));
    parts.push(<mark key={key++} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-accent">{best.h}</mark>);
    rest = rest.slice(best.at + best.h.length);
  }
  return parts;
}

export function Practice(props: Props) {
  const { sessionId, optional, gist, questions, vocab, phrases, grammar } = props;
  const sections = SECTIONS.filter(
    (s) =>
      (s === "gist" && gist) ||
      (s === "detail" && questions.length) ||
      (s === "words" && vocab.length) ||
      (s === "phrases" && phrases.length) ||
      (s === "grammar" && grammar.length) ||
      (s === "response" && props.response) ||
      s === "done",
  );
  const [section, setSection] = useState<Section>(sections[0]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState<Record<string, number>>({});
  const [showText, setShowText] = useState(false);
  const [gistDone, setGistDone] = useState(false);

  const counted = (correct: boolean) => correct && setScore((s) => ({ ...s, [section]: (s[section] ?? 0) + 1 }));
  const advance = (count: number) => {
    if (index + 1 < count) {
      setIndex(index + 1);
      return;
    }
    setSection(sections[sections.indexOf(section) + 1] ?? "done");
    setIndex(0);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {section !== "done" && <ActivityTracker key={section} activity={ACTIVITY[section]} />}
      <div className="mb-5">
        <p className="text-sm text-muted">After reading</p>
        <h1 className="text-[2.25rem] leading-tight font-semibold">{props.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="good">Finished in {props.minutes} min</Badge>
          {props.wpm && <Badge>{props.wpm} words per minute</Badge>}
        </div>
      </div>

      {optional && section !== "done" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft p-4 text-sm text-good">
          <span>This was a pleasure read. Everything here is optional.</span>
          <Button variant="secondary" onClick={() => setSection("done")}>Skip to the end</Button>
        </div>
      )}

      {section !== "done" && (
        <nav className="mb-4 flex flex-wrap gap-1.5 text-sm" aria-label="Steps after reading">
          {sections.filter((s) => s !== "done").map((s) => (
            <span key={s} className={cx("py-1 pr-3", s === section ? "font-bold text-ink" : "text-muted")}>
              {SECTION_LABEL[s]}
            </span>
          ))}
        </nav>
      )}

      {(section === "detail" || section === "words" || section === "phrases") && (
        <div className="mb-4">
          <button type="button" onClick={() => setShowText(!showText)} className="text-sm text-accent underline">
            {showText ? "Hide the text" : "Look back at the text"}
          </button>
          {showText && (
            <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-4 font-serif leading-relaxed">
              {props.lookBack.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
        </div>
      )}

      {section === "gist" && gist && (
        <Card>
          <ChoiceQuestion
            header={<p className="mb-2 text-sm text-muted">First, the main idea</p>}
            question={gist.question}
            options={gist.options}
            check={(choice) => answerItem({ sessionId, kind: "GIST", index: 0, choice })}
            onAnswered={(correct) => {
              counted(correct);
              setGistDone(true);
            }}
            onNext={() => advance(1)}
          />
          {props.prediction && gistDone && (
            <div className="mt-5 rounded-lg bg-paper p-3 text-sm">
              <p className="font-medium">Your prediction</p>
              <p className="text-muted">{props.prediction.question}</p>
              <p className="mt-1">
                You said: <strong>{props.prediction.chosen ?? "–"}</strong>
                {props.prediction.chosen === props.prediction.actual ? (
                  <span className="text-good"> and you were right!</span>
                ) : (
                  <span className="text-muted"> In the text: <strong>{props.prediction.actual}</strong>. Predicting helps you read actively, even when the guess is different.</span>
                )}
              </p>
            </div>
          )}
        </Card>
      )}

      {section === "detail" && (
        <Card>
          <ChoiceQuestion
            key={`q${index}`}
            seed={index}
            header={
              <div className="mb-3 flex items-center gap-3 text-sm text-muted">
                <span className="whitespace-nowrap">Question {index + 1} of {questions.length}</span>
                <ProgressBar value={(index + 1) / questions.length} label="Question progress" />
                <Badge className="hidden sm:inline-flex">{questions[index].skill}</Badge>
              </div>
            }
            question={questions[index].question}
            options={questions[index].options}
            check={(choice) => answerItem({ sessionId, kind: "COMPREHENSION", index, choice })}
            onAnswered={counted}
            onNext={() => advance(questions.length)}
          />
        </Card>
      )}

      {section === "words" && (
        <VocabQuestion
          key={`v${index}`}
          label={`Word ${index + 1} of ${vocab.length}`}
          progress={(index + 1) / vocab.length}
          item={vocab[index]}
          check={(choice) => answerVocab({ sessionId, lemma: vocab[index].lemma, choice })}
          onAnswered={counted}
          onNext={() => advance(vocab.length)}
        />
      )}

      {section === "phrases" && (
        <PhraseCard
          key={`p${index}`}
          item={phrases[index]}
          uzbek={props.uzbek}
          label={`Phrase ${index + 1} of ${phrases.length}`}
          check={(choice) => answerItem({ sessionId, kind: "PHRASE", index: phrases[index].index, choice })}
          complete={(choice) => answerItem({ sessionId, kind: "COLLOCATION", index: phrases[index].index, choice })}
          save={() => savePhrase({ sessionId, index: phrases[index].index })}
          onAnswered={counted}
          onNext={() => advance(phrases.length)}
        />
      )}

      {section === "grammar" && (
        <GrammarDiscovery
          key={`g${index}`}
          item={grammar[index]}
          label={`Grammar ${index + 1} of ${grammar.length}`}
          stage={props.grammarStage}
          discover={(choice) => answerItem({ sessionId, kind: "DISCOVERY", index, choice })}
          practise={(choice) => answerItem({ sessionId, kind: "GRAMMAR", index, choice })}
          onAnswered={counted}
          onNext={() => advance(grammar.length)}
        />
      )}

      {section === "response" && (
        <Card>
          <p className="text-sm text-muted">What do you think?</p>
          <p className="mt-2 font-serif text-xl leading-snug">{props.response}</p>
          <p className="mt-3 text-sm text-muted">There is no right answer. Think about it, write a few words in your notebook, or talk about it in class.</p>
          <Button className="mt-5" onClick={() => setSection("done")}>Done</Button>
        </Card>
      )}

      {section === "done" && <Finish {...props} score={score} optional={optional} />}
    </div>
  );
}

function VocabQuestion({ label, progress, item, check, onAnswered, onNext }: {
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
        <span className={cx("mx-1 inline-block min-w-20 border-b-2 px-1 text-center", result ? (result.correct ? "border-good text-good" : "border-warn text-warn") : "border-accent")}>
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
                  ? "border-warn bg-warn-soft text-warn"
                  : "border-line hover:bg-paper",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {result && (
        <div className="mt-4" aria-live="polite">
          <p className={cx("font-medium", result.correct ? "text-good" : "text-warn")}>{feedbackLine(result.correct)}</p>
          <Button className="mt-3" onClick={onNext} autoFocus>Continue</Button>
        </div>
      )}
    </Card>
  );
}

function PhraseCard({ item, uzbek, label, check, complete, save, onAnswered, onNext }: {
  item: PhraseItem;
  uzbek: boolean;
  label: string;
  check: (choice: number) => Promise<{ correct: boolean; answer: number; explanation: string }>;
  complete: (choice: number) => Promise<{ correct: boolean; answer: number; explanation: string }>;
  save: () => Promise<void>;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [meaningDone, setMeaningDone] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card>
      <p className="mb-1 text-sm text-muted">{label} · Words that often go together</p>
      <p className="mb-4 font-serif text-lg leading-relaxed">{highlightText(item.sentence, [item.inText])}</p>
      <ChoiceQuestion
        compact
        question={item.question}
        options={item.options}
        check={check}
        onAnswered={(correct) => {
          setMeaningDone(true);
          if (!item.collocation) setAnswered(true);
          onAnswered(correct);
        }}
      />
      {meaningDone && uzbek && item.uz && <p className="mt-2 text-muted">O‘zbekcha: {item.uz}</p>}
      {meaningDone && item.collocation && (
        <div className="mt-5 border-t border-line pt-4">
          <ChoiceQuestion
            compact
            question={item.collocation.question}
            header={<p className="mb-1 text-sm text-muted">Now use it: which word makes the phrase?</p>}
            options={item.collocation.options}
            check={complete}
            onAnswered={() => setAnswered(true)}
          />
        </div>
      )}
      {answered && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={saved || pending}
            onClick={() => start(async () => {
              await save();
              setSaved(true);
            })}
          >
            {saved ? "Saved to my words ✓" : "Save this phrase to review"}
          </Button>
          <Button onClick={onNext} autoFocus>Continue</Button>
        </div>
      )}
    </Card>
  );
}

function GrammarDiscovery({ item, label, stage, discover, practise, onAnswered, onNext }: {
  item: GrammarItem;
  label: string;
  stage: number;
  discover: (choice: number) => Promise<{ correct: boolean; answer: number; explanation: string }>;
  practise: (choice: number) => Promise<{ correct: boolean; answer: number; explanation: string }>;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [step, setStep] = useState<"preview" | "notice" | "rule" | "practise">(item.preview ? "preview" : "notice");
  const [discovered, setDiscovered] = useState(false);

  if (step === "preview") {
    return (
      <Card>
        <p className="text-sm text-muted">{label} · {item.stageLabel}</p>
        <h2 className="mt-1 text-lg font-semibold">{item.structure}</h2>
        <p className="mt-2 text-muted">
          This structure is a little ahead of where you are now (stage {stage}). Most learners pick it up later, after lots of
          reading. You can look at it now, or skip it for today.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={onNext}>Skip for now</Button>
          <Button variant="secondary" onClick={() => setStep("notice")}>Look anyway</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{label}</span>
          <span>{item.stageLabel}</span>
        </div>
        <p className="mt-3 text-sm text-muted">Notice</p>
        <p className="mt-1 text-muted">Look at these sentences. The first is from the text.</p>
        <ul className="mt-3 space-y-2">
          {item.examples.map((e, i) => (
            <li key={i} className="border-l-4 border-line pl-3 font-serif text-lg">{highlightText(e, item.highlights)}</li>
          ))}
        </ul>
        <div className="mt-5">
          <ChoiceQuestion
            compact
            question={<>Work it out: {item.discovery.question}</>}
            options={item.discovery.options}
            check={discover}
            onAnswered={() => setDiscovered(true)}
          />
        </div>
        {discovered && step === "notice" && <Button className="mt-4" onClick={() => setStep("rule")} autoFocus>See the rule</Button>}
      </Card>

      {(step === "rule" || step === "practise") && (
        <Card>
          <p className="text-sm text-muted">The rule</p>
          <h2 className="mt-1 text-lg font-semibold">{item.structure}</h2>
          <p className="mt-2 text-muted">{item.explanation}</p>
          {step === "rule" && <Button className="mt-4" onClick={() => setStep("practise")} autoFocus>Try one</Button>}
        </Card>
      )}

      {step === "practise" && (
        <Card>
          <ChoiceQuestion question={item.exercise.question} options={item.exercise.options} check={practise} onAnswered={onAnswered} onNext={onNext} />
        </Card>
      )}
    </div>
  );
}

function Finish(props: Props & { score: Record<string, number> }) {
  const [rating, setRating] = useState<Rating>(props.rating ?? { enjoyment: 0, difficulty: 2, recommend: false });
  const [saved, setSaved] = useState(!!props.rating);
  const [pending, start] = useTransition();
  const ready = rating.enjoyment > 0 && rating.difficulty !== 2;

  const choose = (patch: Partial<Rating>) => {
    setRating((r) => ({ ...r, ...patch }));
    setSaved(false);
  };
  const pill = (active: boolean) =>
    cx("rounded-md border px-3 py-1.5 transition-colors", active ? "border-accent bg-accent text-accent-ink" : "border-accent text-accent hover:bg-accent-soft");

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <p className="text-4xl" aria-hidden>🎉</p>
        <h2 className="mt-2 text-xl font-semibold">You finished “{props.title}”</h2>
        {!props.optional && (props.questions.length > 0 || props.grammar.length > 0) && (
          <p className="mt-3 text-muted">
            {[
              props.gist && `main idea ${props.score.gist ? "✓" : "–"}`,
              props.questions.length && `${props.score.detail ?? 0}/${props.questions.length} details`,
              props.vocab.length && `${props.score.words ?? 0}/${props.vocab.length} words`,
              props.grammar.length && `${props.score.grammar ?? 0}/${props.grammar.length} grammar`,
            ].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-2 text-sm text-muted">Every text you finish makes the next one easier.</p>
      </Card>

      <Card>
        <h3 className="font-semibold">How was it for you?</h3>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Did you enjoy it?">
          {([[3, "😊 Loved it"], [2, "🙂 It was OK"], [1, "😕 Not for me"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={rating.enjoyment === v} onClick={() => choose({ enjoyment: v })} className={pill(rating.enjoyment === v)}>{l}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="How difficult was it?">
          {([[-1, "Too easy"], [0, "Just right"], [1, "Too hard"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={rating.difficulty === v} onClick={() => choose({ difficulty: v })} className={pill(rating.difficulty === v)}>{l}</button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rating.recommend} onChange={(e) => choose({ recommend: e.target.checked })} className="accent-[var(--accent)]" />
          Recommend this text to my classmates
        </label>
        <Button
          className="mt-4"
          variant="secondary"
          disabled={!ready || saved || pending}
          onClick={() => start(async () => {
            await rateText({ textId: props.textId, enjoyment: rating.enjoyment, difficulty: rating.difficulty, recommend: rating.recommend });
            setSaved(true);
          })}
        >
          {saved ? "Thanks! ✓" : "Save"}
        </Button>
      </Card>

      <div className="flex flex-wrap justify-center gap-3">
        {props.next && (
          <ButtonLink href={`/student/read/${props.next.slug}`}>
            {props.next.inSeries ? "Next in the series" : "Next"}: {props.next.title}
          </ButtonLink>
        )}
        <ButtonLink href="/student/library" variant="secondary">Back to library</ButtonLink>
      </div>
    </div>
  );
}
