const TIME_ZONE = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Calendar day (in the app time zone) as a UTC-midnight Date, matching Postgres DATE columns. */
export function dayOf(date: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Monday of the week containing `day` (a dayOf value). */
export function weekStart(day: Date): Date {
  const dow = (day.getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Consecutive active days ending today, or yesterday if today has no activity yet. */
export function streakFrom(activeDays: Set<string>, today: Date): number {
  let cursor = activeDays.has(dayKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
