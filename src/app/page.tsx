import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui";

export default function Home() {
  return (
    <PublicShell>
      <p className="text-center">
        IELTS reading, listening and words.
      </p>
      <div className="mt-6 space-y-2">
        <ButtonLink href="/login" className="w-full">Log in</ButtonLink>
        <p className="pt-2 text-center text-sm text-muted">Students: log in with Telegram.</p>
      </div>
    </PublicShell>
  );
}
