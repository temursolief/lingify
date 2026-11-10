"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "@/app/actions/auth";
import { Button, Field, cx } from "@/components/ui";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action}>
      <h1 className="text-center text-lg font-semibold">Create an account</h1>
      <p className="mt-1 mb-5 text-center text-sm text-muted">It is free.</p>
      <fieldset className="mb-4">
        <legend className="sr-only">I am a</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-paper p-1" role="group">
          {(["STUDENT", "TEACHER"] as const).map((r) => (
            <label
              key={r}
              className={cx(
                "cursor-pointer rounded-md py-1.5 text-center font-medium",
                role === r ? "bg-surface text-ink shadow-bubble" : "text-muted hover:text-ink",
              )}
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {r === "STUDENT" ? "I'm a student" : "I'm a teacher"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-4">
        <Field label="Name" name="name" autoComplete="name" required error={errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
        <Field label="Password (8 characters or more)" name="password" type="password" autoComplete="new-password" required minLength={8} error={errors.password} />
      </div>
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="mt-4 text-center text-sm">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
