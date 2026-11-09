import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export default function Home() {
  return (
    <PublicShell>
      <div className="max-w-3xl space-y-4">
        <p>
          Lingify is a reading platform for intermediate learners of English. You read stories and articles at exactly
          your level, grow your vocabulary, and pick up grammar along the way.
        </p>
        <p>
          Every text is matched to the words you already know. A text opens only when you know at least 95% of its words,
          the point where reading really helps you learn. Tap any word to guess its meaning from the sentence; it then joins
          your review list and comes back just before you would forget it.
        </p>
        <p>
          Teachers can create a class, follow each student&apos;s reading time, vocabulary growth and reading skills, and assign
          texts that every student can read. To get started, <Link href="/signup" className="underline">create a free account</Link>{" "}
          or <Link href="/login" className="underline">log in</Link>.
        </p>
      </div>
    </PublicShell>
  );
}
