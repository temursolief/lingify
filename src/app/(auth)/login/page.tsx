import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log In" };

const NOTICES: Record<string, string> = {
  pending: "Your teacher hasn’t approved you yet, or you were removed from your class. Ask your teacher.",
};

/** The address can carry why the student was sent here; read inside Suspense so the page itself stays prerendered. */
async function WithNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const why = (await searchParams).why;
  return <LoginForm notice={typeof why === "string" ? NOTICES[why] : undefined} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <PublicShell>
      <Suspense fallback={<LoginForm />}>
        <WithNotice searchParams={props.searchParams} />
      </Suspense>
    </PublicShell>
  );
}
