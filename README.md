# Lingify

A reading platform for early-intermediate (low B1) English learners and their teachers. Students read texts matched to the
vocabulary they already know, look up new words in context, review them with spaced repetition, and pick up grammar from
the stories they read. Teachers see time spent, reading volume, vocabulary growth and comprehension for every student.

See [TASK.md](TASK.md) for the full specification.

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Prisma 7 with PostgreSQL, wink-nlp for
lemmatization, Vitest.

## Getting started

Requirements: Node 24, PostgreSQL 17.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL and SESSION_SECRET (openssl rand -hex 32)
npm run db:migrate          # creates the tables
npm run db:seed             # loads the 20-text library and demo accounts
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
   unlocks more texts.

## Learning principles in the product

| # | Principle | Where |
|---|---|---|
| 1 | Easy, comprehensible input | 95% coverage gate (`src/lib/texts.ts`, `src/lib/recommend.ts`) |
| 2 | Variety of topics and genres | 20 texts across 6 genres and 20 topics; library filters; genre variety in recommendations |
| 3 | Learners choose | Free choice in the library; recommendations are suggestions |
| 4 | Read a lot | Words-read stats, weekly word/text/minute goals, streaks |
| 5 | Reading fluency | Words-per-minute per text and trend chart; skimmed sessions are excluded |
| 6 | Read for meaning | Comprehension questions ask about meaning, not form |
| 7 | Individual, silent reading | Self-paced reader |
| 8 | Reading is its own reward | Pleasure reads make exercises optional; reading itself is never graded |
| 9 | Teacher guides | Class dashboard, alerts, text and goal assignments, CSV export |
| 10 | Repeated exposure (8–12 encounters) | Exposure count per learning word; recommendations favour texts that recycle learning words |
| 11 | Spaced repetition | `src/lib/srs.ts` (1, 3, then growing intervals) |
| 12 | Retrieval practice | Review asks for the missing word, never shows it first |
| 13 | Learning in context | Every review card uses the sentence where the student met the word |
| 14 | Immediate feedback | Every answer is checked on the server and explained at once |
| 15 | Incidental grammar | Grammar points quote a sentence from the text, with one recognition exercise |
| 16 | Balance of activities | Each text moves through reading → understanding → words → grammar; daily review |
| 17 | Goals and visible progress | Goals, vocabulary growth curve, time-by-activity charts |
| 18 | Desirable difficulty | Review switches from multiple choice to typed recall once recent accuracy is above 90% |

## Time tracking

Only *active* time counts. The browser adds a second only while the tab is visible and the student interacted recently
(2 minutes for reading, 1 minute for everything else), and reports it every 15 seconds to `/api/heartbeat`, which caps
each report at 60 seconds. Time is stored per student, per day, per activity.

## Known limitations

- Definitions come from the free [Free Dictionary API](https://dictionaryapi.dev) and are cached in the database. Some
  definitions are written for native speakers, and lookups need internet access the first time.
- Days and weeks use the server's time zone (override with `APP_TIMEZONE`).
- The library has 20 texts; TASK.md suggests at least 100 for launch.
