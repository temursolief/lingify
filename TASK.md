# Lingify — status

_Updated 2026-11-11._ IELTS Academic Reading practice and Anki flashcards for Uzbek students (B1+) and their
teachers. The original specification (graded reading with the 95% rule) is in git history, commit `ad6decf`.

The plan for the next six changes (assigned-only content, passage decks, listening vocabulary, analytics) is in [PLAN.md](PLAN.md).

## Built

- **Students:** home page of folders (Passages, Listening, Flashcards, Progress) under one top bar.
  - Passages: a timed first try gives a band estimate. Wrong answers turn red, and the student corrects them by
    highlighting the sentence that proves the new answer, then says why they missed it.
  - Listening lessons: a video plus IELTS questions and key words.
  - Flashcards: Anki scheduling (no card waits longer than 20 days), shared decks, and one-click cards from
    highlighted phrases.
  - Progress: mistakes by cause.
  - Offline mode: the app installs on phones (PWA) and keeps a copy of due cards and passages, then syncs.
- **Teachers:** classes with join codes; assigning passages; per-class view (activity, stuck students, first-try
  mistakes, where students looked). A "+" menu adds everything.
- **Admins** (`ADMIN_EMAILS`): upload passages and listening lessons (JSON) and Anki decks (.apkg) for everyone.
- Optional Telegram link and reminders.
- **Hosting:** Netlify (free) and a Neon Postgres database (free, US East). Every push to `main` deploys.

## Key decisions

- Scope is IELTS passages, listening and Anki only; the graded-reading library was removed.
- The right answer is never shown: the student must find and prove it.
- One host only, on free plans: Netlify and Neon. Migrations run during the Netlify build.
- All data, including deck images and sounds, lives in Postgres; there is no file storage.
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
- **Local development:** the local `.env` points to the live database.

## Next steps

1. Confirm on the live site: deck upload and the Check button, on phones.
2. Give local development its own database.
3. Better card meanings without paid AI: a bigger glossary, or meanings teachers can edit.
4. Control teacher sign-up (an invite code) before sharing widely.
5. If wanted: send Telegram reminders from a Netlify scheduled function.
6. When it becomes commercial: an always-on server in Europe, for speed and larger uploads.
