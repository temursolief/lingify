# Lingify

IELTS Academic Reading practice for Uzbek students and their teachers. Students work through timed passages, then
correct their own mistakes. To check a corrected answer they must highlight the sentence in the passage that proves
it. They also study Anki flashcards, including cards they make in one click from phrases they highlight in a passage.
Teachers upload their own passages as JSON and assign them. They see which questions the class got wrong on the first
try, where each student looked, why they say they missed each answer, and who is stuck.

See [TASK.md](TASK.md) for the current status: what is built, key decisions, known issues and next steps.

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Prisma 7 with PostgreSQL, Vitest.
Anki packages are read with Node's built-in `node:sqlite` and `zlib` (zstd) plus `fflate` for the zip. Card meanings
come from the project glossary and the free dictionary at dictionaryapi.dev.

## Getting started

Requirements: Node 24, PostgreSQL 17.

```bash
npm install
cp .env.example .env        # set DATABASE_URL, SESSION_SECRET (openssl rand -hex 32) and ADMIN_EMAILS
npm run db:migrate          # creates the tables
npm run db:seed             # 6 built-in passages, a demo Anki deck and demo accounts
npm run dev                 # http://localhost:3000
```

Demo accounts (local only, password `lingify-demo`):

| Email | Role |
|---|---|
| `teacher@lingify.test` | Teacher of **IELTS Morning Group** (join code `DEMO01`). Admin if listed in `ADMIN_EMAILS` |
| `student@lingify.test` | Student with two finished passages, all corrected, and some flashcard history |
| `jasur@lingify.test` | Student stuck on one question after three tries; his Aral Sea test was auto-finished (left the tab) and his flashcards were clicked through too fast, to show the integrity flags |
| `malika@lingify.test` | Student who has not started |

`npm run db:seed` deletes and recreates every `@lingify.test` account. `npm run db:seed -- --content` reloads only the
passages and the demo deck. The seed also writes `public/samples/demo-deck.apkg`, which you can upload as an admin to try
the importer.

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs the login cookie. At least 32 characters in production (`openssl rand -hex 32`) |
| `APP_TIMEZONE` | The school's time zone, e.g. `Asia/Tashkent`. Days, streaks and due dates are counted in it. Without it the server's own zone is used, which is usually UTC on a host |
| `DATABASE_POOL_MAX` | Optional. Most database connections kept open (default 10) |
| `ADMIN_EMAILS` | Comma-separated teacher emails that may upload Anki decks for every student |
| `TELEGRAM_*`, `APP_URL` | Optional Telegram reminders (below) |

## How it works

### Interface

The layout follows Telegram Desktop: a list column on the left and the open section on the right.

- **Students** have four rows: **Passages** (badge: passages from the teacher still to do), **Listening**,
  **Flashcards** (badge: cards due today) and **Progress**.
- **Teachers** have one row per class (badge: stuck students), then **My passages**, **Listening** and **Anki decks**
  (admins only) and **New class**.

System fonts only, so nothing is downloaded before the first page shows.

### Passages: first try, then corrections

- **First try.** It is timed (20 minutes by default, set per passage) and submitted automatically when time runs out.
  This try alone gives the score and estimated band. The passage and questions sit side by side, with the question
  numbers in a bar along the bottom. It starts behind a gate and runs under the test lock (below); the questions are
  sent to the browser only when the student presses Start, and the clock runs on the server from that moment.
- **After submitting.** The passage stays open. Each answer field and its number in the bottom bar turn green (correct)
  or red (wrong). The correct answer is never shown for a red question, and explanations appear only once the student
  finds the answer themselves.
- **Prove it.** To check a red question again, the student chooses a new answer and highlights the sentence in the
  passage that proves it. Answers already tried are crossed out and cannot be tried again. The highlight stays on the
  passage, labelled with the question number. A proof can also be added on the first try, but it is optional there.
- **Root-cause tag.** When a red question turns green on a later try, the student picks why they missed it before it
  locks:
  - Vocab / Synonym
  - Trap / Distractor
  - Logic / NG vs False
  - Speed / Careless

  The passage is complete when every question is green and tagged.
- **Location or comprehension error.** If the passage gives an `evidence` paragraph for a question, Lingify compares the
  student's proof with it. A proof in another paragraph is a *location error*; a proof in the right paragraph with a
  wrong answer is a *comprehension error*.

The rules live in `src/lib/passages.ts`. Answers are checked on the server and never sent to the browser
(`publicGroups` in `src/lib/passage-format.ts`). Checks and tags lock the attempt row while they run, so two quick
clicks (or two tabs) can never lose a try.

### Test lock (Reading and Listening first tries)

Each assignment has a **test lock** rule, chosen when assigning (default: strict):

| Rule | Leaving the tab, switching windows or exiting fullscreen |
|---|---|
| **Strict** | Submits the first try at once |
| **One warning** | The first time: a 5-second warning that covers the test ("Return to fullscreen"). Not back in time, or a second time: submitted |
| **Practice** | Only recorded for the teacher |

- **Fullscreen.** "Enter fullscreen & start" puts the page in fullscreen on desktop and Android. iPhones have no
  fullscreen for web pages, so there the lock is leaving the tab or the app alone. If a browser refuses fullscreen
  (or never answers), the test runs with the visibility lock and the teacher sees "Fullscreen refused".
- **What counts as leaving:** a hidden tab, another window or app focused, fullscreen exited, or leaving the page
  (closing, reloading, the back button, an in-app link). Focus moving into the Listening video is not leaving. A
  dropped connection is not leaving: nothing in the lock looks at the network.
- **Guards during the first try:** copy, cut and the context menu are blocked on the test; paste into answers is
  blocked (recorded under Practice); Ctrl/Cmd+F is blocked in Reading; developer-tools keys are blocked. All are
  recorded with the time and question.
- **When the test is finished for the student**, whatever they answered is graded at once (blank answers count as
  wrong), fullscreen ends, and a banner explains why. They still do every "Prove it" correction to finish the
  homework.
- **Weak connections.** Answers, telemetry and events are kept in sessionStorage. A submission that cannot reach
  the server is shown as "Submitting…" and sent again every 5 seconds; a closing tab sends it with
  `navigator.sendBeacon` to `/api/attempt-terminate`. Every route is idempotent: the first submission to arrive wins.
- **Telemetry**, sent inside the one Submit request (no requests during the test): seconds per question (only while
  the tab is visible), the time of each first answer, how often answers changed, and for Listening the video's
  pauses, seeks and speed changes.
- **Flags for the teacher** (`src/lib/telemetry.ts`, recomputed on the server from the raw times):
  - auto-finished (tab, window, fullscreen), with the time and how many questions were answered;
  - answer key suspected: 5 or more first answers within 15 seconds, or band 7.5+ in under 3.5 minutes;
  - unrealistic speed: band 8+ in under a quarter of the expected time (72 s per question);
  - can't locate their answers: 4 "Prove it" highlights in a row in the wrong paragraph;
  - amber (check): a warning used, pastes, 3+ answers under 4 seconds, or a reading first try under 8 minutes.

  These are signals for a conversation, not proof. The lock runs in the student's browser, so a second device or a
  modified browser can get past it.

### Passage JSON format

Teachers upload one JSON file per passage on **My passages**. The **Format guide** page explains every field and shows a
complete example, also at `public/samples/passage-example.json`. In short:

```json
{
  "title": "The History of Glass",
  "timeLimit": 20,
  "paragraphs": ["Paragraph A…", "Paragraph B…"],
  "questionGroups": [
    { "type": "tfng", "instructions": "…", "questions": [{ "number": 1, "statement": "…", "answer": "TRUE", "evidence": "A" }] }
  ]
}
```

Question types: `tfng`, `ynng`, `mcq`, `headings`, `matching`, `completion` (gap written as `___`) and `summary` (gaps
written as `{{number}}`). Uploads are validated by the schema in `src/lib/passage-format.ts`. Errors come back as a
list, e.g. `questionGroups → 1 → questions → 0 → answer: Answer F is not one of the options`. The six built-in passages
in `content/ielts/` use the same format.

### Listening Comprehension

A separate library of video lessons, e.g. TED-Ed. Admin teachers upload one JSON file per lesson on **Listening**
(format guide and a TED-Ed example at `public/samples/listening-example.json`). The file holds three things:

- the YouTube link
- the IELTS Listening questions with their answers: note completion (`notes`: `## ` headings, `* ` bullets, gaps
  `{{11}}`), sentence completion, summary, multiple choice and T/F/NG. `"allowNumber": true` implements "NO MORE THAN
  TWO WORDS AND/OR A NUMBER".
- optional key vocabulary (`word`, `meaning`, `uz`, `example`)

The upload refuses the example until every "FILL IN" placeholder answer is replaced.

Each file becomes a lesson page:

- **Layout.** The video and its key words on the left, the questions on the right, question numbers along the bottom.
- **First submission.** It gives the score and an estimated listening band (IELTS Listening conversion table).
- **Corrections.** Wrong answers turn red and are never corrected for the student: they replay the video and try a new
  answer. Answers already tried are refused.
- **Key words first.** The key words are shown before the questions; "I've read these words" unlocks the test gate.
  They also become the lesson's shared deck, with each word blanked out in its example sentence.
- **Test lock.** The first try is proctored like a reading passage (see "Test lock"), with no time limit; the video's
  own fullscreen button is turned off during it.

**Keeping it light:**

- A lesson is one row (`ListeningLesson`: questions and vocabulary as JSON), and a student's attempt is one row
  (`ListeningAttempt`: every question's state in one JSON column). Opening a lesson reads two rows, and checking an
  answer reads and writes one.
- The video shows as a ~20 KB thumbnail. The YouTube player (about 1 MB) loads from youtube-nocookie.com only when the
  student presses play, and only on that page.
- Answers stay on the server. Listening needs a connection, so it is not part of the offline copy.

### Anki flashcards

- **Shared decks.** An admin teacher uploads an `.apkg` exported from Anki desktop on **Anki decks**, and every student
  gets the deck. Both the old format (`collection.anki2` / `.anki21`) and the current zstd-compressed `collection.anki21b`
  are read (`src/lib/apkg.ts`).
- **Card rendering.** Note-type templates are rendered as Anki does: fields, `{{FrontSide}}`, conditional sections, and
  `text:` and `cloze:` filters with cloze deletions (`src/lib/anki-template.ts`). Images and sounds are stored and
  served from `/api/media`. Cards show in a sandboxed frame with the deck's own CSS, and scripts are removed.
- **Studying.** It works like AnkiWeb: a deck list with New / Learn / Due counts, then **Show answer** and Again / Hard /
  Good / Easy with the next interval above each button. Keys: Space, then 1–4.
- **Scheduler.** Anki's SM-2 with its default options (steps 1m 10m, graduating 1 day, easy 4 days, 250% starting ease,
  20 new cards a day), with one change: **no interval exceeds 20 days** (`src/lib/anki.ts`).
- **Cards from passages.** Highlighting up to 8 words in a passage offers **Make flashcard**:
  - Front: the whole sentence from the passage with the chunk replaced by `[...]`.
  - Back: the chunk in its sentence, a short learner definition and, if the student keeps Uzbek on, an Uzbek translation.

  Cards go to the passage's deck (only this student sees their own), and can be undone from the notification.
- **Study speed.** Each answer records how long the card was on screen before it was rated (`ReviewLog.durationMs`,
  capped at a minute). Teachers see the median per student; reviews with a median under 1.2 s, or new cards rated
  Easy in under 2 s more than 85% of the time, show as "clicked through too fast".

### Progress and teacher views

- **Student Progress.** The biggest bottleneck (e.g. "57% of your mistakes are trap / distractor in Matching
  headings"), the tag breakdown, mistakes by question type, location vs comprehension errors, and first-try scores.
- **Class → Students.** One row per student: passages done, band (last 3), flashcards in 7 days, streak and last active.
  A **Stuck students** box lists anyone with a question still red after 3 or more tries.
- **Class → Students** also shows each student's flagged first tries and flashcard speed.
- **Class → Homework.** Per assignment, one row per student with three checks:
  1. **First try**: not started / in progress / submitted (score, band);
  2. **Corrections**: every red answer corrected (and, for a passage, proved and tagged); wrong-paragraph proofs are
     counted;
  3. **Vocabulary**: today's due cards in the passage's or lesson's deck (done / due), the deck's known and learning
     share, cards made from highlights, and study speed.

  Then an integrity badge (green clean, amber check, red auto-finished or flagged, with the reasons) and **Require
  retake**, which sets the attempt aside (kept, but out of every score) and gives the student a fresh, locked test.
  Homework is **done** when the first try is in, every answer is corrected, and, if the assignment asks for it, the
  vocabulary is cleared.
- **Class → Passages.** For each assigned passage, a heatmap with students against questions:
  - green: right the first time
  - amber: corrected (the number is how many tries)
  - red: still wrong
  - grey stripes: left blank because the test was auto-finished

  Hovering a cell shows the first answer, seconds on the question, its place in the answer order, the proof's
  paragraph and the reason. Each column header shows the percentage of the class that got that question wrong on the
  first try, and each row the time and integrity badge. **Mistake magnets** lists the 3 questions where most students
  chose the same wrong answer. Assigning is done here too, to the whole class or to chosen students, with an optional
  due date, note, test lock rule and vocabulary requirement.
- **Class → Mistakes.** The same breakdown as a student's Progress page, for the whole class, plus a question type ×
  cause matrix (the four reasons, wrong paragraph, misread).
- **Student page.** Every answer given to each question, seconds on it and answer order, the sentence highlighted as
  proof (with a wrong-paragraph warning), the reason the student chose, the test's integrity badge and event
  timeline, and Listening attempts with video use.
- **Deleting** a passage, lesson or deck archives it: it leaves every list, homework and deck, but students' attempts
  and review history are kept.

## Installable app and offline use

Lingify is a progressive web app: Chrome and Edge offer **Install**, which opens it in its own window like a desktop app.

- **Fast start.** A service worker (`public/sw.js`) keeps the built app files and deck media, so the app opens without
  downloading them again. Pages always come from the server.
- **Offline copy.** While online, the sidebar keeps a copy in IndexedDB (`/api/offline/pack`, skipped with an ETag when
  nothing changed):
  - every deck's cards due within a day, plus today's new cards
  - up to six passages, teacher assignments first
- **No connection.** Any page opened without a connection shows `/offline`. Flashcards are studied there with the same
  scheduler as the server, and answers are queued and sent to `/api/offline/sync`, with a retry every 30 seconds.
  Passages can be read; their questions need a connection.
- **Shared laptops.** Log out deletes the offline copy.

The service worker is registered only in production builds (`npm run build && npm start` locally, or on Netlify).

## Deploying

Lingify is hosted on **Netlify** (the app) with a **Neon** PostgreSQL database, both on their free plans. Netlify
builds the app from GitHub and deploys every push to `main`; its settings are in `netlify.toml` (Node 24, database
migrations, then the build). Everything, including deck images and sounds, is stored in the database, so nothing is
lost between deploys.

### First deploy

1. **Database.** On [neon.tech](https://neon.tech): create a project in **AWS US East 2 (Ohio)**, next to Netlify's
   functions. From **Connect**, copy two connection strings: the **pooled** one (its host contains `-pooler`) and the
   **direct** one (pooling off).
2. **Site.** On [app.netlify.com](https://app.netlify.com): **Add new project → Import an existing project → GitHub** →
   this repository. Leave the build settings as Netlify reads them from `netlify.toml`.
3. **Environment variables.** Before deploying: **Project configuration → Environment variables**, scope all:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon's **pooled** connection string |
   | `DIRECT_DATABASE_URL` | Neon's **direct** connection string (migrations at build time) |
   | `SESSION_SECRET` | the output of `openssl rand -hex 32`, kept secret |
   | `APP_URL` | `https://your-site.netlify.app`, the address Netlify gives the site (update it if you rename the site) |
   | `APP_TIMEZONE` | `Asia/Tashkent` |
   | `ADMIN_EMAILS` | your own teacher email(s), comma-separated. **Not** `teacher@lingify.test`: anyone could sign up with it |
   | `TELEGRAM_*` | optional, see [Telegram reminders](#telegram-reminders) |

4. **Deploy.** **Deploys → Trigger deploy**. The build applies the migrations to Neon, then builds the app.
5. **Built-in passages, once.** On your computer, with Neon's **direct** string:

   ```bash
   DATABASE_URL="postgresql://…direct string…" npm run db:seed -- --content
   ```

   Run it **only once**: running it again deletes and recreates the demo deck, with the students' progress on it.
   Never run plain `npm run db:seed` against this database: it creates the demo accounts.
6. **Check** on a phone: open the `netlify.app` address, sign up as a student, study a few cards, turn on airplane
   mode and reopen the app (offline mode), then sign up with an `ADMIN_EMAILS` address and upload a passage.

After that, every `git push` to `main` deploys again. A failed migration stops the deploy, and the live version keeps
running.

### Free plan limits

- **Uploads up to about 4.5 MB.** Passage and lesson JSON files are fine; a large Anki `.apkg` (with images or sounds)
  is refused.
- **Location.** Free Netlify functions run in the US (Ohio): pages take roughly 0.2–0.3 s longer from Uzbekistan than
  from a server in Europe.
- **Usage.** Netlify's free plan has a monthly pool of credits (deploys, requests, bandwidth): a deploy costs 15 credits,
  so push finished work rather than every small change. Neon's free database sleeps after 5 minutes without use and
  takes a moment to wake.
- **Login limits are per copy.** Failed logins are counted in memory, and several copies of the app may run at once.
- **Telegram reminders** are not sent on a schedule (see below).

## Scripts

| Command | What it does |
|---|---|
| `npm run db:deploy` | Applies database migrations on a server |
| `npm test` | Unit tests: Anki scheduler, passage format and grading, .apkg import, card templates, dates, integrity rules. With `TEST_DATABASE_URL` set to a throwaway database (migrations applied), also the proctored-submission tests against PostgreSQL |
| `npm run lint` | ESLint |
| `npm run telegram:remind` | Telegram reminders (`-- --weekly` for teacher summaries, `-- --dry-run` to preview) |
| `npm run telegram:bot` | Telegram bot in long-polling mode, for local development |

## Telegram reminders

Students and teachers link Telegram in Settings: the app gives a one-time link that opens the bot with `/start CODE`.

1. Create a bot with [@BotFather](https://t.me/BotFather) and set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and
   `APP_URL` in `.env`.
2. Production: set `TELEGRAM_WEBHOOK_SECRET` and register the webhook once:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$APP_URL/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"`.
   Local development: run `npm run telegram:bot` (long polling) instead.
3. Send the reminders from a computer with the live `DATABASE_URL` set (Netlify does not run them on a schedule):
   - `npm run telegram:remind` every evening: students with flashcards due or an unfinished passage from their teacher.
   - `npm run telegram:remind -- --weekly` once a week: each teacher gets a summary per class (passages, flashcards,
     band and stuck students).

The scripts run with `tsx --conditions=react-server` so the app's `server-only` modules load outside Next.js.

## Known limitations

- **Bands are estimates.** A passage is a third of the real test, so its score is scaled to 40 before converting.
- **Anki import.** The scheduling history inside the package is not imported: every student starts the deck fresh.
  Typing-answer fields (`{{type:…}}`), text-to-speech and LaTeX are not rendered.
- **Card meanings.** Multi-word chunks not in the glossary get no meaning on the back, and a single word gets the
  dictionary's first meaning, which is not always the sense used in the passage.
- **Offline.** Passage questions and new cards from highlights need a connection.
- **Uzbek translations** come from the project glossary and should be checked by an Uzbek-speaking teacher.
- **The test lock** runs in the browser: it deters and records, it does not make cheating impossible. iPhones get no
  fullscreen. Under the strict rule, a phone's screen locking or a notification pulled down submits the test.
