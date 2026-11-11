# Lingify — plan for the next six changes

_Written 2026-11-11._ Each change below has how to build it with little or no extra load on the free plans
(Netlify and Neon), and its side effects.

## Where the load is

All six fit the free plans. Three things would strain them if built the obvious way:

- **Database storage:** each teacher .apkg puts its images and sounds into Postgres, and Neon's free plan has a
  small storage limit.
- **Database writes from tracking:** an event for every question would multiply writes and wake the database far
  more often.
- **Copying decks per student:** a copy of the cards for each student would multiply rows by class size.

The rule for all three: one shared deck per lesson or passage, and tracking data rides inside requests the app
already makes.

## 1. Listening: vocabulary first, then a deck, then the questions — done

**Cost: low.** The vocabulary is already stored in the lesson (`ListeningLesson.vocabulary`).

- **Deck:** one shared deck per lesson, created when the teacher uploads the lesson, linked by lesson ID and named
  "{title} Vocabulary". Each student's schedule already lives in their own `CardState` rows, so no copies: about 20
  cards once, nothing extra per student.
- **Gate:** the student presses "I've read these words" and one timestamp is saved on their `ListeningAttempt`. The
  questions stay hidden until then, and the words are hidden while the questions are shown.
- **Side effects:**
  - Students who already pressed "Add to My IELTS chunks" will have the words twice. That button goes. — done:
    removed, with the action replaced by "I've read these words".
  - Existing lessons need their decks created once. — done: created lazily the first time the lesson is opened
    (`ensureLessonDeck` in `src/lib/listening.ts`), and also at upload time for new ones.
  - Students who already started a lesson count as having read the words. — done: a fresh attempt with any
    answer or a first submission already on it (from before the gate existed) counts as read.
  - Link the deck by lesson ID, not title: two lessons can share a title. — done (`Deck.lessonId`, unique).
  - Not done: the deck's "O'zbekcha" line can no longer follow each student's own `uzbekGlosses` setting, since the
    cards are now shared rather than personal. It is always shown when the lesson has one.

## 2. Videos keep playing after leaving the page — done

**Cost: none, and it saves data.** Cause confirmed: with Cache Components on, Next.js keeps up to 3 recent pages
alive but hidden (React `<Activity>`), so the YouTube player keeps playing.

- **Fix:** in `LiteVideo` (`src/components/lite-video.tsx`), turn `playing` off in a `useLayoutEffect` cleanup, the
  pattern in `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.
- **Side effect:** returning to the page starts the video from the beginning. If that matters, save the playback
  position and resume with `?start=`. — not done; no report that it matters yet.

## 3. One Anki deck per passage; highlights go to that deck — mostly done

**Cost: low for the database, but the storage risk grows.**

- **Link:** a passage ID on `Deck`, unique: one deck per passage. — done.
- **Students' own cards:** the deck is shared, so a highlight added to it would show for every student. Add an
  owner to `Card`: empty for the teacher's cards, the student's ID for their own. Every deck query shows "teacher's
  cards plus mine". One column and one index, no copies. — done.
- **Side effects:**
  - **Re-uploading a deck** would today replace the cards and lose every student's progress on them. Store Anki's
    note ID and update matching cards instead. — done (`Card.ankiNoteId`; `src/lib/deck-import.ts`).
  - **Passages with no deck:** highlights need a home, either an empty deck created automatically or the personal
    deck as before. — done: created automatically (`passageDeck` in `src/lib/decks.ts`), the same way the personal
    deck is.
  - **Who uploads:** only admins can upload decks today; teachers need upload access. — done: a teacher uploads a
    deck for their own passage from `/teacher/passages`; uploading one with no passage (the old shared-with-everyone
    kind, from `/teacher/decks`) is still admin only.
  - **Upload limit:** Netlify's limit of about 4.5 MB still applies. — unchanged; not addressed here.
  - **Storage:** every deck's images and sounds count against Neon's storage. Store each media file once by
    content hash and cap media size per deck. — **partly done, deliberately cut down:** each deck now has a 20 MB
    cap (`MAX_DECK_MEDIA_BYTES`), and re-uploading the same export does not add duplicate media rows. What is not
    done: content-hash dedup **across** decks (two decks sharing an identical sound would still store it twice).
    That needs media URLs keyed by hash instead of by deck ID, which means rewriting the `/api/media` route and the
    HTML already baked into every existing card — a real migration, not attempted without discussing it first.
  - **Deleting a passage** today deletes the deck, students' own cards and their review history. Archive instead.
    — **not done.** `deletePassage` (`src/app/actions/teacher.ts`) still hard-deletes, cascading to its deck. Needs
    an `archived` flag and a filter everywhere passages are listed; left for a dedicated pass.
  - **Old cards:** existing "My IELTS chunks" cards stay where they are. — true: unaffected.

## 4. Students see only what is assigned; flashcards follow — done

**Cost: low.** Mostly filter changes.

- **Passages:** `passageVisibleTo` (`src/lib/passages.ts`) also shows built-in passages to everyone; that part goes.
- **Listening:** lessons have no assignments yet. `Assignment` must accept a passage or a lesson.
- **Decks:** visible only if their passage or lesson is assigned. The filter goes into every deck query: the deck
  list, the study queue, saving answers (`applyReviews`), the "due today" badge (or it counts cards the student
  cannot see) and offline sync.
- **Side effects:**
  - **Practice material:** students lose built-in passages and shared decks they already study. Self-study
    disappears entirely, a product decision.
  - **Unassigning:** recommended rule is that anything once assigned stays visible, so no student loses cards in
    the middle of learning them.
  - **Offline copies** on phones must drop unassigned passages.
  - **Students with no class** see an empty app and need a "Join a class" message.
  - **Personal deck:** "My IELTS chunks" stays visible; it is the student's own.

## 5. Teacher analytics: time online, time per question, answer order

**The riskiest change.** The heartbeat (`src/app/api/heartbeat/route.ts`) already sends a request every 30 s from
each active student: 2 database writes, and it keeps Neon awake.

- **Don't** send an event per question, per answer change or per minute.
- **When online and for how long:** first-seen and last-seen times on the existing `ActivityTime` row, which the
  heartbeat already writes: no new requests. For separate sessions, start a new session row only after a gap of
  10 minutes or more.
- **Time per question and answer order:** recorded in the browser while the student works (answer changes with
  times, active time per question, reusing the existing idle detection), sent inside the existing Submit request
  and stored as JSON on the attempt. No new requests, and it works offline.
- **Counting time per question:** time since the student's previous answer change, counting only time the tab is
  visible and the student is active. The first question also absorbs reading time; the teacher view labels it.
- **Practice vs. analysis time:** after the first submit the heartbeat reports a separate "correcting" activity,
  and each Check request carries the time since the last one.
- **Side effects:**
  - **Privacy:** students should be told they are tracked.
  - **Two open tabs** already count time twice.
  - **Phones** pause pages in the background, so some seconds are lost.
  - **Clocks:** server time for when things happened, browser timing only for durations.
  - **Storage:** a few KB per attempt, fine.
  - **No live "online now" view:** a self-refreshing teacher page would add constant load. Work it out when the
    teacher opens the page.

## 6. Vocabulary list by deck or A–Z, reading and listening together

**Cost: low, with one problem.** Card text is stored as display HTML, and imported Anki cards use any layout, so
there is no clean word to sort by.

- **Fix:** a plain-text word and meaning on each card, filled in on import and whenever a card is created, with an
  index. The list is one paged query (about 50 rows at a time), with each card's status (new, learning, known) from
  the student's own schedule.
- **Side effects:**
  - **Existing cards** need the word filled in once. Highlight cards have a clean word field; imported cards only
    allow a best guess from their HTML.
  - **The same word in two decks** needs a rule: group them or show both.
  - **Visibility** follows change 4.

## Order

1. Video fix (2): trivial. — done.
2. Visibility (4): changes 1, 3 and 6 depend on it. — done.
3. Listening deck and passage decks (1 and 3) together: both create decks linked to content. — done (3 with the
   storage dedup and passage-archiving side effects deliberately left; see above).
4. Vocabulary list (6). — not started.
5. Analytics (5). — not started.
