"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <h1 className="text-center text-lg font-semibold">Log in</h1>
      <p className="mt-1 mb-5 text-center text-sm text-muted">Enter your email and password.</p>
      <div className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="mt-3 text-bad" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}
