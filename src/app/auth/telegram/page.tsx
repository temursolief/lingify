import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { LinkLogin } from "./link-login";

export const metadata: Metadata = { title: "Log In" };

async function WithCode({ searchParams }: { searchParams: PageProps<"/auth/telegram">["searchParams"] }) {
  const t = (await searchParams).t;
  return <LinkLogin code={typeof t === "string" ? t : ""} />;
}

/**
 * Where the bot's one-time "Open Lingify" link lands. The link is used only when the button is pressed (a POST), so a
 * link preview or a prefetch cannot spend it.
 */
export default function TelegramLinkPage(props: PageProps<"/auth/telegram">) {
  return (
    <PublicShell>
      <Suspense fallback={<LinkLogin code="" />}>
        <WithCode searchParams={props.searchParams} />
      </Suspense>
    </PublicShell>
  );
}
