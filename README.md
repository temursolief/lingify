# Lingify

A reading platform for early-intermediate (low B1) English learners in Uzbekistan and their teachers, building towards
IELTS Academic. Students read texts matched to the vocabulary they already know, learn words and lexical chunks in
context (with optional Uzbek translations), review them with spaced repetition, follow a daily plan set by their teacher,
and practise IELTS reading under timed conditions. Teachers see time spent, daily-plan completion, reading volume,
vocabulary growth, comprehension and an estimated IELTS band for every student, and can add their own texts.

See [TASK.md](TASK.md) for the full specification.

## Interface

Laid out like Telegram Desktop: a list column on the left and the open section on the right, each scrolling on its own.
Students see six rows, each with one line of status, like the last message in a chat: **Today** (the plan and one
suggested text), **Read**, **Review** (with a due-count badge), **IELTS**, **Speed reading** and **Progress** (Overview
and My words). Their name at the bottom opens Settings, where Log out lives. Teachers see one row per class, plus New
class and My texts; signing in opens their newest class. Interface text uses the system font, so nothing is downloaded
before the first page shows. Passages use serif fonts already installed on Windows and macOS. Students no longer set
their own goals; weekly goals come from the teacher.

## Installable app and offline use

Lingify is a progressive web app: Chrome and Edge offer **Install**, which opens it in its own window like a desktop app.

- **Fast start.** A service worker (`public/sw.js`) keeps the built app files, so the app opens without downloading
  them again. Pages always come from the server, since they are personal.
- **Offline copy.** While the student is online, the sidebar keeps a copy of their next six texts (teacher assignments
  first) and the review words due within a day in IndexedDB (`/api/offline/pack`). An ETag means nothing is downloaded
  when the copy has not changed. The line at the bottom of the sidebar says what is saved.
- **No connection.** Any page opened without a connection shows `/offline`: Review, plus the saved texts with word
  meanings and Uzbek translations. Answers, lookups and finished texts are queued and sent to `/api/offline/sync` once
  the server can be reached again, with a retry every 30 seconds. Graded offline, a review gives the same result as
  online: both use `src/lib/review-grade.ts`.
- **Slow connection.** `experimental.useOffline` shows a banner when requests fail and retries them when the connection
  returns.
- **Shared laptops.** Log out deletes the offline copy, and a different student signing in replaces the previous
  student's copy.

The service worker is registered only in production builds (`npm run build && npm start`); in development it is
removed, so cached files never hide code changes.

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Prisma 7 with PostgreSQL, wink-nlp for
lemmatization, Vitest.

## Getting started

Requirements: Node 24, PostgreSQL 17.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL and SESSION_SECRET (openssl rand -hex 32)
npm run db:migrate          # creates the tables
npm run db:seed             # loads the 20 graded texts, 6 IELTS passages and demo accounts
npm run dev                 # http://localhost:3000
```

Demo accounts (local only, password `lingify-demo`):

| Email | Role |
|---|---|
| `teacher@lingify.test` | Teacher of class **B1 Morning Group** (join code `DEMO01`) |
| `student@lingify.test` | Student, ~2,600 known words |
| `jasur@lingify.test` | Student, ~2,900 known words, very active |
| `malika@lingify.test` | Student, ~2,200 known words, struggling (triggers teacher alerts) |

`npm run db:seed` deletes and recreates every `@lingify.test` account. Use `npm run db:seed -- --texts` to reload only the library.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests for scheduling, placement scoring, coverage and lemmatization |
| `npm run lint` | ESLint |
| `npm run data:report` | Coverage of each library text for simulated learners who know 2,000 / 2,500 / 3,000 words, plus its rarest words |
| `npm run telegram:remind` | Sends daily Telegram reminders (`-- --weekly` for teacher summaries, `-- --dry-run` to preview) |
| `npm run telegram:bot` | Telegram bot in long-polling mode, for local development |
| `npm run data:ranks` | Rebuilds `data/lemma-ranks.json` and `data/lemma-forms.json` from `data/word-frequency.json` |

`data/word-frequency.json` was exported from the Python [wordfreq](https://pypi.org/project/wordfreq/) package with
`scripts/export-frequency.py`; you only need to rerun that to change the source list.

## How the 95% rule works

1. **Word families.** Every text is tokenized and lemmatized once, at seed time (`src/lib/nlp.ts`). Inflected and derived
   forms map to their most frequent family member (`relaxed` → `relax`, `drank` → `drink`, `secretly` → `secret`).
   Names, nationalities and numbers are left out of the count.
2. **Placement.** A yes/no vocabulary test samples 8 content words from each 1,000-word frequency band, mixed with
   made-up pseudowords. Saying "yes" to pseudowords lowers the score through the standard guessing correction. Harder
   bands (7–10) are tested only if the learner still knows half of band 6. The result seeds the student's known words.
3. **Coverage.** A text's coverage is the share of its running words (not distinct words) the student knows. Below 95% a text
   is locked; from 98% it is a pleasure read with optional exercises. Teachers can only assign a text to students who are
   at 95% or above; the rest are listed back to the teacher.
4. **Growth.** Looking up a word moves it to *learning*. After five correct spaced reviews in a row it becomes *known*, which
   unlocks more texts. Known words come back for a check-up after 30 days, then at growing intervals up to a year; a
   failed check-up returns the word to *learning*.
5. **Incidental learning.** Finishing a text records every new word in it as *seen*. A seen word met 10 times across at
   least 3 different texts becomes *known* without being studied (`recordReading` in `src/lib/vocab.ts`).
6. **Multiple contexts.** Each word keeps up to 6 sentences from different texts, and review rotates through them so the
   student does not just memorise one sentence (`src/lib/contexts.ts`).

## Learning principles in the product

| # | Principle | Where |
|---|---|---|
| 1 | Easy, comprehensible input | 95% coverage gate (`src/lib/texts.ts`, `src/lib/recommend.ts`) |
| 2 | Variety of topics and genres | 20 texts across 6 genres and 20 topics; library filters; genre variety in recommendations |
| 3 | Learners choose | Free choice in the library; recommendations are suggestions |
| 4 | Read a lot | Words-read stats, teacher-set weekly word/text/minute goals, streaks |
| 5 | Reading fluency | Words-per-minute per text and trend chart; skimmed sessions are excluded |
| 6 | Read for meaning | Comprehension questions ask about meaning, not form |
| 7 | Individual, silent reading | Self-paced reader |
| 8 | Reading is its own reward | Pleasure reads make exercises optional; reading itself is never graded |
| 9 | Teacher guides | Class dashboard, alerts, text and goal assignments, CSV export |
| 10 | Repeated exposure (8–12 encounters) | Exposure count per word; seen words become known after 10 encounters in 3 texts; recommendations favour texts that recycle learning words |
| 11 | Spaced repetition | `src/lib/srs.ts` (1, 3, then growing intervals) |
| 12 | Retrieval practice | Review asks for the missing word, never shows it first |
| 13 | Learning in context | Review cards rotate through up to 6 sentences where the student met the word |
| 14 | Immediate feedback | Every answer is checked on the server and explained at once |
| 15 | Incidental grammar | Grammar points quote a sentence from the text, with one recognition exercise |
| 16 | Balance of activities | Each text moves through reading → understanding → words → grammar; daily review |
| 17 | Goals and visible progress | Teacher goals, vocabulary growth curve, time-by-activity charts |
| 18 | Desirable difficulty | Review switches from multiple choice to typed recall once recent accuracy is above 90% |

## ELT methodology in the lesson flow

Each text is a staged reading lesson, written by hand in `content/lessons/<slug>.json` and merged with the story at seed
time (`scripts/library.ts` validates that every item matches its text).

| Source | Where |
|---|---|
| **CELTA receptive-skills staging** | Before reading: lead-in question, prediction, at most 3 pre-taught words with concept-check questions (CCQs). Gist task shown while reading and asked first afterwards, then the prediction is revealed. Detailed questions with a "look back at the text" panel. Personal response at the end. |
| **CELTA guided discovery** | Grammar starts with highlighted examples (the first from the text) and a "work it out" question, then the rule, then practice. |
| **Krashen: input hypothesis** | 95% coverage gate; pleasure reads (98%+) make every stage optional. |
| **Krashen: affective filter** | Wrong answers shown in amber with "Good try" wording, never red; "Stop reading" at any time with no penalty, and the reason tunes recommendations; text ratings. |
| **Krashen: natural order** | `src/lib/grammar-sequence.ts` orders 25 B1 structures into 5 stages (articles and dependent prepositions included, because Uzbek has neither); structures two or more stages ahead of the student are offered as an optional preview. |
| **Schmidt: noticing** | On a re-read, "Notice the grammar" highlights the structures in the text. |
| **Nation: guessing from context** | Tapping a word first asks the student to guess its meaning from the sentence (3 options from the B1 glossary), then shows a learner-friendly definition (`content/glossary.json`). |
| **Nation: four strands** | Meaning-focused input (reading), language-focused learning (words, phrases, grammar), fluency development (Speed reading: easy texts against a personal target, with a main-idea check so skimming doesn't count). |
| **Lewis: Lexical Approach** | 12 chunks per text (collocations, dependent prepositions, phrasal verbs, fixed expressions), each with an Uzbek translation. Clicking any word of a chunk opens the whole chunk first ("get used to", not "used"). After reading, up to 6 chunks are practised (chunks the student clicked come first): meaning, then a collocation gap ("_____ used to"), then saved to review. |
| **Narrow reading** | 6 topic series; the next part is recommended and shown as "Continue your series". |
| **DELTA reading sub-skills** | Every question is tagged (gist, detail, inference, reference, vocabulary in context, attitude, organisation). Students and teachers see first-try accuracy per skill; the class page shows the class profile and each student's weakest skill. |
| **CEFR can-do** | Eleven reading can-do statements (nine B1, plus IELTS band 5.5+ and AWL sublists 1–3), judged from the student's answers, reading range, speed and habits. |

To add a text, write `content/texts/<slug>.json` and `content/lessons/<slug>.json`, add B1 definitions for any rare words
the seed lists, then run `npm run db:seed -- --texts`.

## Uzbek support

- Word definitions and chunks show a short Uzbek translation (`content/glossary.json`, `phrases[].uz` in the lessons).
  Students can turn this off in Settings or with the UZ button in the reader, and are encouraged to as they get stronger.
- Grammar points for structures Uzbek handles differently (articles, dependent prepositions, present perfect) carry an
  Uzbek note on the typical mistake (`uzNote`).

## Daily plan and deadlines

The student's **Today** page shows only the daily plan and the next text. The plan: 20 reviews (or all that are due), finish one text, and practise for the
class's daily minutes (20 by default; the teacher changes it on the class page). Below it, the teacher's assignments
with due dates, overdue ones in red. The class page shows a 14-day grid per student (✓ plan complete, ◐ some practice,
blank nothing) and how many students are late on each assignment.

## Telegram reminders

Students and teachers link Telegram in Settings: the app gives a one-time link that opens the bot with `/start CODE`.

1. Create a bot with [@BotFather](https://t.me/BotFather) and set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and
   `APP_URL` in `.env`.
2. Production: set `TELEGRAM_WEBHOOK_SECRET` and register the webhook once:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$APP_URL/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"`.
   Local development: run `npm run telegram:bot` (long polling) instead.
3. Schedule the reminders with cron:
   - `npm run telegram:remind` every evening: students whose plan is not finished, with what is left and overdue work.
   - `npm run telegram:remind -- --weekly` once a week: each teacher gets a summary of their classes.
   - Add `-- --dry-run` to print the messages without sending.

The scripts run with `tsx --conditions=react-server` so the app's `server-only` modules load outside Next.js.

## IELTS track

`content/ielts/<slug>.json` holds six Academic Reading passages (about 500 words, shorter than the real 700–900 so B1+ students can
finish; 13 questions each, 20 minutes) with True / False / Not Given, matching headings, and sentence or summary completion. `npm run db:seed -- --texts`
validates them (answers must appear in the passage and respect the word limit). On the IELTS page students see:

- an estimated reading band, averaged over their last three passages, from the raw-score-out-of-40 conversion table;
- their progress through Coxhead's Academic Word List (570 headwords, 10 sublists, `data/awl.json`, from
  [EAP Foundation](https://www.eapfoundation.com/vocab/academic/awllists/)); UK and US spellings both count;
- the passages, each with its coverage. After the test, a passage can be studied like any text (word lookups, chunks)
  once the student knows 90% of its words.

Answers count towards the reading sub-skill profile, and the teacher sees each student's band and attempts.

## Teacher texts

Teachers add their own texts under **My texts** (title, genre, paragraphs, up to 5 multiple-choice questions). The text is
lemmatized on save, appears only in the libraries of that teacher's students, follows the same 95% rule, and can be
assigned. The list shows how many students can already read each text.

## Time tracking

Only *active* time counts. The browser adds a second only while the tab is visible and the student interacted recently
(2 minutes for reading, 1 minute for everything else), and reports it every 15 seconds to `/api/heartbeat`, which caps
each report at 60 seconds. Time is stored per student, per day, per activity.

## Known limitations

- Definitions come from the free [Free Dictionary API](https://dictionaryapi.dev) and are cached in the database. Some
  definitions are written for native speakers, and lookups need internet access the first time.
- Days and weeks use the server's time zone (override with `APP_TIMEZONE`).
- The library has 20 graded texts and 6 IELTS passages; TASK.md suggests at least 100 for launch. Teacher texts help
  fill the gap.
- Teacher texts have no glossary entries, lesson stages, chunks or grammar points; lookups fall back to the dictionary API.
- Uzbek translations were written for this project and should be checked by an Uzbek-speaking teacher.
- Offline, texts have no lesson stages or questions, and pronunciation and full dictionary entries are unavailable.
  IELTS, speed reading and new texts need a connection.
