const TIME_ZONE = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Calendar day (in the app time zone) as a UTC-midnight Date, matching Postgres DATE columns. */
export function dayOf(date: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** How far the app time zone is ahead of UTC at `date`, in milliseconds. */
function zoneOffset(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant a wall-clock time (given as if it were UTC) happens in the app time zone. */
function fromZone(wall: Date): Date {
  const guess = new Date(wall.getTime() - zoneOffset(wall));
  return new Date(wall.getTime() - zoneOffset(guess));
}

/** Midnight that starts the calendar day of `date` in the app time zone. */
export function startOfDay(date: Date): Date {
  return fromZone(dayOf(date));
}

/** The last millisecond of the calendar day of `date` in the app time zone. */
export function endOfDay(date: Date): Date {
  return new Date(fromZone(addDays(dayOf(date), 1)).getTime() - 1);
}

/** A "YYYY-MM-DD" date from a form as the end of that day in the app time zone, or null if it is not a real date. */
export function endOfDayOn(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const day = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || dayKey(day) !== ymd) return null;
  return new Date(fromZone(addDays(day, 1)).getTime() - 60_000);
}

/** A date as students and teachers read it, in the app time zone: "Mon, 9 Nov". */
export function formatDay(date: Date, weekday = false): string {
  return date.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", ...(weekday ? { weekday: "short" } : {}) });
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
