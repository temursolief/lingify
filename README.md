# Lingify

IELTS Academic Reading practice for Uzbek students and their teachers. Students work through timed passages, then
correct their own mistakes. To check a corrected answer they must highlight the sentence in the passage that proves
it. They also study Anki flashcards, including cards they make in one click from phrases they highlight in a passage.
Teachers upload their own passages as JSON and assign them. They see which questions the class got wrong on the first
try, where each student looked, why they say they missed each answer, and who is stuck.

See [TASK.md](TASK.md) for the original specification. The graded-reading library it describes has since been removed
in favour of IELTS passages only.

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Prisma 7 with PostgreSQL, Vitest.
Anki packages are read with Node's built-in `node:sqlite` and `zlib` (zstd) plus `fflate` for the zip. Card meanings
come from Claude (`@anthropic-ai/sdk`), with a dictionary fallback.

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
| `jasur@lingify.test` | Student stuck on one question after three tries |
| `malika@lingify.test` | Student who has not started |

`npm run db:seed` deletes and recreates every `@lingify.test` account. `npm run db:seed -- --content` reloads only the
passages and the demo deck. The seed also writes `public/samples/demo-deck.apkg`, which you can upload as an admin to try
the importer.

### Environment

| Variable | Purpose |
|---|---|
| `ADMIN_EMAILS` | Comma-separated teacher emails that may upload Anki decks for every student |
| `ANTHROPIC_API_KEY` | Optional. Claude (`claude-opus-5-5`) writes the meaning and Uzbek translation on highlight-made cards. Without it, the glossary or dictionary is used, which often finds nothing for multi-word chunks |
| `TELEGRAM_*`, `APP_URL` | Optional Telegram reminders (below) |

## How it works

### Interface

The layout follows Telegram Desktop: a list column on the left and the open section on the right.

- **Students** have three rows: **Passages** (badge: passages from the teacher still to do), **Flashcards** (badge:
  cards due today) and **Progress**.
- **Teachers** have one row per class (badge: stuck students), then **My passages**, **Anki decks** (admins only) and
  **New class**.

System fonts only, so nothing is downloaded before the first page shows.

### Passages: first try, then corrections

- **First try.** It is timed (20 minutes by default, set per passage) and submitted automatically when time runs out.
  This try alone gives the score and estimated band. The passage and questions sit side by side, with the question
  numbers in a bar along the bottom.
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
(`publicGroups` in `src/lib/passage-format.ts`).

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

  Cards go to the student's own deck, **My IELTS chunks**, and can be undone from the notification.

### Progress and teacher views

- **Student Progress.** The biggest bottleneck (e.g. "57% of your mistakes are trap / distractor in Matching
  headings"), the tag breakdown, mistakes by question type, location vs comprehension errors, and first-try scores.
- **Class → Students.** One row per student: passages done, band (last 3), flashcards in 7 days, streak and last active.
  A **Stuck students** box lists anyone with a question still red after 3 or more tries.
- **Class → Passages.** For each assigned passage, a heatmap with students against questions:
  - green: right the first time
  - amber: corrected (the number is how many tries)
  - red: still wrong

  Each column header shows the percentage of the class that got that question wrong on the first try, so you can see
  which question to go through in class. Assigning is done here too, to the whole class or to chosen students, with an
  optional due date and note.
- **Class → Mistakes.** The same breakdown as a student's Progress page, for the whole class.
- **Student page.** Every answer given to each question, the sentence highlighted as proof (with a wrong-paragraph
  warning), and the reason the student chose.

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

The service worker is registered only in production builds (`npm run build && npm start`).

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests: Anki scheduler, passage format and grading, .apkg import, card templates, dates |
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
3. Schedule the reminders with cron:
   - `npm run telegram:remind` every evening: students with flashcards due or an unfinished passage from their teacher.
   - `npm run telegram:remind -- --weekly` once a week: each teacher gets a summary per class (passages, flashcards,
     band and stuck students).

The scripts run with `tsx --conditions=react-server` so the app's `server-only` modules load outside Next.js.

## Known limitations

- **Bands are estimates.** A passage is a third of the real test, so its score is scaled to 40 before converting.
- **Anki import.** The scheduling history inside the package is not imported: every student starts the deck fresh.
  Typing-answer fields (`{{type:…}}`), text-to-speech and LaTeX are not rendered.
- **Card meanings.** Without `ANTHROPIC_API_KEY`, many highlighted chunks get no meaning on the back.
- **Offline.** Passage questions and new cards from highlights need a connection.
- **Uzbek translations** come from Claude or the project glossary and should be checked by an Uzbek-speaking teacher.
