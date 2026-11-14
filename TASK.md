# Lingify — status

_Updated 2026-11-12._ IELTS Academic Reading practice and Anki flashcards for Uzbek students (B1+) and their
teachers. The original specification (graded reading with the 95% rule) is in git history, commit `ad6decf`.

The plan for the next six changes (assigned-only content, passage decks, listening vocabulary, analytics) is in
[PLAN.md](PLAN.md). Of those six, done: video fix, visibility (assigned-only passages/lessons/decks), the listening
vocabulary deck and gate, passage decks (core — see PLAN.md for what was deliberately cut from that one), and most
of the teacher analytics (time per question and answer order, as part of §7). Not started: the vocabulary list.

**Latest (2026-11-14): game economy.** Warfront light theme and a nine-stage fortress per student. XP is small and
slow on purpose: 3 per answer right at the first try (the most any answer earns), 2 / 1 per proof, 0.5 per reason, 0.2
per unhurried card, 3 per homework. It can also be lost: -10 for a day with no real action (a shield saves the streak
and spares this), -3 for a day with no flashcards, -5 for a test walked out of; penalties stop after 7 idle days and
never take XP below where the current stage began. Stages sit at levels 1, 3, 5, 7, 9, 12, 15, 18, 22 (a Fort is about
three months of steady work). XP lives in `XpDay` (tenths of a point per student per day, recounted by `refreshXp`,
which also charges missed days the first time anyone looks after midnight); rules are in `src/lib/xp.ts`,
`src/lib/fortress.ts`, `src/lib/xp-recount.ts`. The weekly class goal is 150 XP per student.

**Earlier (2026-11-12): homework verification, test integrity and deep test analytics** — PLAN.md §7. A proctored
first try (fullscreen + tab lock) for Reading and Listening, telemetry sent inside the one Submit request,
anti-cheating flags, flashcard speed checks, a Homework tab for teachers, "Require retake", soft delete, and the
retry race fixes. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) is the engineering overview.

## Built

- **Students:** home page of folders (Passages, Listening, Flashcards, Progress) under one top bar. A student in no
  class sees a "join a class" message instead.
  - Passages: only those a teacher assigned. A timed first try gives a band estimate. Wrong answers turn red, and
    the student corrects them by highlighting the sentence that proves the new answer, then says why they missed it.
  - **Test lock** on every first try (Reading and Listening), set per assignment: strict (leaving the tab, another
    window or fullscreen submits the test), one warning, or practice (only recorded). Fullscreen on desktop and
    Android; visibility-only on iPhones. Copy, paste, Ctrl+F and developer-tools keys are blocked and logged. The
    questions reach the browser only at Start. An auto-finished try is graded as it stands and the student still
    does the "Prove it" corrections.
  - Listening lessons: only those a teacher assigned. Key words first; the student marks them read before the
    video's IELTS questions unlock.
  - Flashcards: Anki scheduling (no card waits longer than 20 days); the student's own deck, plus the shared deck
    for each assigned passage (the teacher's cards and their own highlighted phrases together) and each assigned
    lesson's key words. Each answer records how long the card was on screen (`ReviewLog.durationMs`).
  - Progress: mistakes by cause.
  - Offline mode: the app installs on phones (PWA) and keeps a copy of due cards and passages, then syncs.
- **Teachers:** classes with join codes; assigning passages and listening lessons, to the whole class or chosen
  students, with a test-lock rule and an optional vocabulary requirement; per-class view (activity, stuck students,
  first-try mistakes, where students looked); uploading an Anki deck for one of their own passages, from
  `/teacher/passages` (re-uploading updates matching cards instead of duplicating them). A "+" menu adds everything.
  - **Homework tab:** per assignment and student, three checks (first try, corrections, vocabulary), an integrity
    badge (green / amber / red with reasons) and **Require retake**.
  - **Passages tab:** first-try heatmap with a blank-after-auto-finish state, tooltips (first answer, time on the
    question, answer order, proof paragraph, reason), time and integrity per student, and the top 3 "mistake
    magnets" (same wrong answer chosen by many).
  - **Mistakes tab:** question type × cause matrix, including wrong-paragraph vs misread.
  - **Students tab and student page:** flagged-attempt count, flashcard speed, the event timeline of each test,
    seconds per question and answer order.
  - "Delete" on a passage, lesson or deck archives it: attempts, decks and review history are kept.
- **Admins** (`ADMIN_EMAILS`): upload passages and listening lessons (JSON) for everyone, and the old kind of Anki
  deck shared with every student regardless of assignment (`/teacher/decks`).
- Optional Telegram link and reminders.
- **Hosting:** Netlify (free) and a Neon Postgres database (free, US East). Every push to `main` deploys.

## Key decisions

- Scope is IELTS passages, listening and Anki only; the graded-reading library was removed.
- The right answer is never shown: the student must find and prove it.
- Students see only what is assigned to them; there is no more self-study on built-in or shared material.
- One deck per passage or lesson, shared by every student it is assigned to; a student's own cards (highlights,
  "My IELTS chunks") never get copied per student. `Card.ownerId` tells a teacher's card from a student's own.
- One host only, on free plans: Netlify and Neon. Migrations run during the Netlify build (`npm run db:deploy`,
  `prisma migrate deploy`) — never run `prisma migrate dev` locally, since the local `.env` points at the live
  database (see Known issues).
- All data, including deck images and sounds, lives in Postgres; there is no file storage.
- Test telemetry costs no extra requests: it is buffered in the browser (sessionStorage backup) and sent inside the
  one Submit request (or the `/api/attempt-terminate` beacon when the tab closes). The server recomputes every
  count it flags on, and times the test by its own clock from "Start test".
- Integrity flags are signals for the teacher, never automatic penalties beyond the auto-submit itself; the right
  answer is still never shown, and an auto-finished student still does the corrections.
- Content is archived, never hard-deleted, once students may have work on it.
- No paid AI: card meanings come from the project glossary and dictionaryapi.dev.
- Minimal UI: home folders and a top bar (the Telegram-style side list was dropped). Must work on phones.

## Known issues

- **Card meanings are weak:** multi-word chunks not in the glossary get none, and single words get the
  dictionary's first sense. The Uzbek glossary hasn't been checked by an Uzbek speaker.
- **Netlify free-plan limits:**
  - uploads up to about 4.5 MB, so large .apkg decks fail;
  - servers in the US, adding about 0.2–0.3 s per page from Uzbekistan;
  - a monthly credit allowance;
  - the Neon database sleeps after 5 minutes without use.
- **Accounts:** anyone can sign up as a teacher, and emails aren't verified (the admin should sign up first).
  Failed-login limits are counted per server copy.
- **Telegram reminders** don't run on a schedule.
- **"Check question N" not working (student report):** no bug was reproduced. The button now always explains what's
  missing; this still needs confirming with students.
- **Local development:** the local `.env` points to the live database. Work on 2026-11-12 used a throwaway local
  PostgreSQL instead (`DATABASE_URL=… npx prisma migrate dev`, then `npm run db:seed`), where the new migration
  `20261112160139_homework_integrity_and_analytics` was generated and applied. It has not yet run on Neon: it goes
  live at the next Netlify deploy. It adds a CHECK that every assignment has exactly one of passage/lesson; a row
  breaking that would stop the deploy (the old version keeps running).
- **Proctoring is a deterrent, not a guarantee.** It runs in the student's browser: a determined student can use a
  second device, or a modified browser that never reports leaving. The pace and "Prove it" flags are there for the
  second device; nothing detects a modified browser. Fullscreen is not available on iPhones.
- **Strict lock and phones:** a notification pulled down or the screen locking hides the tab and submits the test
  under STRICT. Teachers who expect phone use may prefer WARN_ONCE.
- **Listening telemetry** (pauses, seeks, speed) relies on YouTube's postMessage channel; if YouTube changes it, the
  counts stay at zero and nothing else breaks.
- **Homework vocabulary requirement** for a passage means "nothing left to study today in the passage's deck",
  checked when the student studies or finishes; a deck added after the passage was finished is only checked the next
  time the student studies it. Homework assigned before 2026-11-12 keeps no vocabulary requirement.
- **Deck media storage:** capped per deck (20 MB) and not duplicated on re-upload, but not deduplicated by content
  hash across different decks — two decks with the same sound file each store their own copy. Fixing that means
  keying `/api/media` URLs by content hash instead of by deck ID, which touches every card's already-stored HTML;
  worth a dedicated pass, not a drive-by change.
- **Archived content** has no "restore" button yet: set `archivedAt` back to null in the database.
- **Lesson vocabulary cards** can no longer honour a student's own "show Uzbek" setting, since the cards are shared
  by the whole class rather than personal: the Uzbek line is shown to everyone or no one, per lesson.

## Next steps

1. Confirm on the live site: deck upload and the Check button, on phones.
2. Give local development its own database.
3. Better card meanings without paid AI: a bigger glossary, or meanings teachers can edit.
4. Control teacher sign-up (an invite code) before sharing widely.
5. If wanted: send Telegram reminders from a Netlify scheduled function.
6. When it becomes commercial: an always-on server in Europe, for speed and larger uploads.
7. From PLAN.md: the vocabulary list (plain-text word + meaning per card, sortable A–Z or by deck) is not started;
   of the teacher analytics, time online per session is not started (time per question and answer order are done).
8. From PLAN.md §3: content-hash media dedup across decks; a "restore" for archived content.
9. After the next deploy: try the test lock on a real Android phone and an iPhone (fullscreen and visibility), and
   decide the default lock per class (STRICT is the default today).
