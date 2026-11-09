import { PageSkeleton } from "@/components/ui";
import { Suspense } from "react";
import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import { PlacementFlow } from "./placement-flow";

export const metadata: Metadata = { title: "Placement" };

async function PlacementPageContent() {
  const user = await requireStudent({ allowWithoutPlacement: true });
  return <PlacementFlow name={user.name} initialTopics={user.topicPrefs} retake={user.placementDone} />;
}

export default function PlacementPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlacementPageContent />
    </Suspense>
  );
}
