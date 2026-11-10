import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { SidebarUserLink } from "./sidebar-user-link";

async function UserRow({ href }: { href: string }) {
  const session = await getSession();
  return <SidebarUserLink href={href} name={session?.name || "Account"} />;
}

/** The signed-in person at the bottom of the list; opens Settings (where Log out lives). */
export function SidebarUser({ href }: { href: string }) {
  return (
    <Suspense fallback={<div className="h-[52px]" />}>
      <UserRow href={href} />
    </Suspense>
  );
}
