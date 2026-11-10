"use client";

import { useTransition } from "react";
import { logout } from "@/app/actions/auth";
import { clearOfflineData } from "@/lib/offline-store";
import { Button } from "./ui";

/** Logs out and removes the offline copy, so nothing personal stays on a shared laptop. */
export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="text-bad hover:bg-bad-soft hover:text-bad"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await clearOfflineData();
          await logout();
        })
      }
    >
      Log out
    </Button>
  );
}
