"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <h1 className="text-[2.25rem] leading-tight font-semibold">Log In</h1>
      <p className="mt-2 mb-4">Log in to an existing account.</p>
      <div className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="mt-3 text-bad" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-4 px-4 py-2 text-xl">
        {pending ? "Logging in…" : "Log In"}
      </Button>
      <p className="mt-2">
        <Link href="/signup" className="underline">Create an account</Link>
      </p>
    </form>
  );
}
