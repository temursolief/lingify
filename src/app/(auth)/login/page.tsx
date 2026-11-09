"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Log in</h1>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/signup" className="text-accent underline">Create an account</Link>
      </p>
    </form>
  );
}
