export const TOPICS = [
  "daily-life", "friendship", "family", "food", "travel", "cities", "technology", "science", "nature",
  "animals", "environment", "health", "sports", "history", "culture", "music", "art", "work", "money", "school",
] as const;

export function topicLabel(topic: string) {
  return topic.replace("-", " ").replace(/^\w/, (c) => c.toUpperCase());
}
