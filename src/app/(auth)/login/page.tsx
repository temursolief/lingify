import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log In" };

export default function LoginPage() {
  return (
    <PublicShell hideLogin>
      <LoginForm />
    </PublicShell>
  );
}
