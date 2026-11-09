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
      <h1 className="text-[2.25rem] leading-tight font-semibold">Sign Up</h1>
      <p className="mt-2 mb-4">Create a free account.</p>
      <fieldset className="mb-4">
        <legend className="mb-2">I am a</legend>
        <div className="inline-flex" role="group">
          {(["STUDENT", "TEACHER"] as const).map((r, i) => (
            <label
              key={r}
              className={cx(
                "cursor-pointer border border-accent px-3 py-1.5",
                i === 0 ? "rounded-l-md" : "-ml-px rounded-r-md",
                role === r ? "bg-accent text-accent-ink" : "text-accent hover:bg-accent-soft",
              )}
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {r === "STUDENT" ? "Student" : "Teacher"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-4">
        <Field label="Name" name="name" autoComplete="name" required error={errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
        <Field label="Password (8 characters or more)" name="password" type="password" autoComplete="new-password" required minLength={8} error={errors.password} />
      </div>
      <Button type="submit" disabled={pending} className="mt-4 px-4 py-2 text-xl">
        {pending ? "Creating account…" : "Sign Up"}
      </Button>
      <p className="mt-2">
        Already have an account? <Link href="/login" className="underline">Log in</Link>
      </p>
    </form>
  );
}
