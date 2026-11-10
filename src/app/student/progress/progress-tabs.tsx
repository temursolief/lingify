import { Tabs } from "@/components/ui";

export function ProgressTabs({ current }: { current: "overview" | "words" | "skills" }) {
  return (
    <Tabs
      current={current}
      items={[
        { key: "overview", label: "Overview", href: "/student/progress" },
        { key: "words", label: "My words", href: "/student/words" },
        { key: "skills", label: "Skills", href: "/student/progress/skills" },
      ]}
    />
  );
}
