"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "@/app/actions/auth";
import { Button, Field, cx } from "@/components/ui";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <fieldset>
        <legend className="text-sm font-medium">I am a…</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["STUDENT", "TEACHER"] as const).map((r) => (
            <label
              key={r}
              className={cx(
                "cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium",
                role === r ? "border-accent bg-accent-soft text-accent" : "border-line text-muted",
              )}
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {r === "STUDENT" ? "Student" : "Teacher"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Name" name="name" autoComplete="name" required error={errors.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} error={errors.password} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="text-accent underline">Log in</Link>
      </p>
    </form>
  );
}
