import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui";

export default function Home() {
  return (
    <PublicShell>
      <p className="text-center">
        Read English texts at your level, learn new words as you go, and practise for IELTS. Your teacher can follow your progress.
      </p>
      <div className="mt-6 space-y-2">
        <ButtonLink href="/login" className="w-full">Log in</ButtonLink>
        <p className="pt-2 text-center text-sm text-muted">Students: log in with Telegram. New? Send your class code to our Telegram bot, and your teacher approves you.</p>
      </div>
    </PublicShell>
  );
}
