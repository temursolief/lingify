"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logInWithLink } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export function LinkLogin({ code }: { code: string }) {
  const [state, action, pending] = useActionState(async () => logInWithLink(code), undefined);
  return (
    <form action={action} className="text-center">
      <h1 className="text-xl">Open Lingify</h1>
      <p className="mt-1 mb-5 text-sm text-muted">From your Telegram link. It works once, for 10 minutes.</p>
      <Button type="submit" disabled={pending || !code} className="w-full">
        {pending ? "Logging in…" : "Continue to Lingify"}
      </Button>
      {state?.error && (
        <p className="mt-3 text-sm text-bad" role="alert">
          {state.error} <Link href="/login">Log in</Link>
        </p>
      )}
    </form>
  );
}
