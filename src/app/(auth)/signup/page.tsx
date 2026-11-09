import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign Up" };

export default function SignupPage() {
  return (
    <PublicShell hideSignup>
      <SignupForm />
    </PublicShell>
  );
}
