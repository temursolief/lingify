# Lingify — status

_Updated 2026-11-11._ IELTS Academic Reading practice and Anki flashcards for Uzbek students (B1+) and their
teachers. The original specification (graded reading with the 95% rule) is in git history, commit `ad6decf`.

The plan for the next six changes (assigned-only content, passage decks, listening vocabulary, analytics) is in
[PLAN.md](PLAN.md). Of those six, done: video fix, visibility (assigned-only passages/lessons/decks), the listening
vocabulary deck and gate, and passage decks (core — see PLAN.md for what was deliberately cut from that one). Not
started: the vocabulary list and teacher analytics.

## Built

- **Students:** home page of folders (Passages, Listening, Flashcards, Progress) under one top bar. A student in no
  class sees a "join a class" message instead.
  - Passages: only those a teacher assigned. A timed first try gives a band estimate. Wrong answers turn red, and
    the student corrects them by highlighting the sentence that proves the new answer, then says why they missed it.
  - Listening lessons: only those a teacher assigned. Key words first; the student marks them read before the
    video's IELTS questions unlock.
  - Flashcards: Anki scheduling (no card waits longer than 20 days); the student's own deck, plus the shared deck
    for each assigned passage (the teacher's cards and their own highlighted phrases together) and each assigned
    lesson's key words.
  - Progress: mistakes by cause.
  - Offline mode: the app installs on phones (PWA) and keeps a copy of due cards and passages, then syncs.
- **Teachers:** classes with join codes; assigning passages and listening lessons, to the whole class or chosen
  students; per-class view (activity, stuck students, first-try mistakes, where students looked); uploading an Anki
  deck for one of their own passages, from `/teacher/passages` (re-uploading updates matching cards instead of
  duplicating them). A "+" menu adds everything.
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
- **Local development:** the local `.env` points to the live database. A migration this session wrote
  (`prisma/migrations/20261111140000_deck_links_and_vocab_gate`) was therefore never run with `prisma migrate dev`
  against it; it was hand-written in the same style as Prisma's own output and goes live at the next
  `prisma migrate deploy` on Netlify. Check it applies cleanly there before trusting this deploy.
- **Deck media storage:** capped per deck (20 MB) and not duplicated on re-upload, but not deduplicated by content
  hash across different decks — two decks with the same sound file each store their own copy. Fixing that means
  keying `/api/media` URLs by content hash instead of by deck ID, which touches every card's already-stored HTML;
  worth a dedicated pass, not a drive-by change.
- **Deleting a passage** still hard-deletes its deck and every student's cards and review history on it, cascading
  from the database schema. Archiving instead needs an `archived` flag and a filter added everywhere passages are
  listed — left for later, see PLAN.md §3.
- **Lesson vocabulary cards** can no longer honour a student's own "show Uzbek" setting, since the cards are shared
  by the whole class rather than personal: the Uzbek line is shown to everyone or no one, per lesson.

## Next steps

1. Confirm on the live site: deck upload and the Check button, on phones.
2. Give local development its own database.
3. Better card meanings without paid AI: a bigger glossary, or meanings teachers can edit.
4. Control teacher sign-up (an invite code) before sharing widely.
5. If wanted: send Telegram reminders from a Netlify scheduled function.
6. When it becomes commercial: an always-on server in Europe, for speed and larger uploads.
7. From PLAN.md: the vocabulary list (plain-text word + meaning per card, sortable A–Z or by deck) and teacher
   analytics (time online, time per question, answer order) are not started.
8. From PLAN.md §3: archive passages instead of deleting them; content-hash media dedup across decks.
