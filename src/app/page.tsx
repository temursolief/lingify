import { ButtonLink } from "@/components/ui";

const POINTS = [
  { title: "Texts you can actually read", body: "Every text is matched to your vocabulary. You see it only when you already know at least 95% of its words, the level where real progress happens." },
  { title: "Words that stay", body: "Tap any word for its meaning. It joins your review queue with the sentence you met it in, and comes back just before you would forget it." },
  { title: "Grammar on the way", body: "Short grammar notes point out useful structures inside the stories you read. No drills, just noticing." },
  { title: "Progress you can see", body: "Time spent, words read, reading speed and vocabulary growth. Teachers see the same picture for their whole class." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="text-xl font-semibold tracking-tight">Lingify</span>
        <nav className="flex gap-2">
          <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
          <ButtonLink href="/signup">Sign up</ButtonLink>
        </nav>
      </header>

      <section className="mt-16 max-w-2xl sm:mt-24">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">For intermediate English learners</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight font-semibold sm:text-5xl">
          Read more. Understand more. Remember the words.
        </h1>
        <p className="mt-5 text-lg text-muted">
          Lingify gives you stories and articles at exactly your level, so you can read for meaning, grow your vocabulary and
          pick up grammar naturally.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Start reading</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">I&apos;m a teacher</ButtonLink>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted">{p.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
