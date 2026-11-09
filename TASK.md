# Lingify — Task Description

English learning platform for **reading and vocabulary growth**, with grammar improved incidentally along the way. Web app. Target audience: **early-intermediate (low B1) students** and their **teachers**.

## 1. Purpose & Scope

- Reading-only platform (no speaking/listening/writing modules in v1).
- Students grow reading skill and vocabulary through extensive reading of texts they can already understand (≥95% vocabulary coverage).
- Teachers monitor progress, guide students, and manage classes.
- Out of scope for v1: mobile apps, teacher-authored content, AI-generated texts, levels other than early-intermediate.

## 2. Core Pedagogical Constraint: the 95% Rule

Research shows learners make reading progress only when they know **at least 95% of the running words** in a text (98% is ideal for pleasure reading). The platform must enforce this:

1. **Vocabulary placement test** on signup — adaptive test (frequency-sampled, ~10 min) estimating the student's known-word set (expected ~2,000–3,000 word families at low B1).
2. **Per-student vocabulary model** — continuously updated set of known / learning / unknown words, updated by reading exposure, lookups, and review results.
3. **Text–student matching engine** — every text in the library is tokenized and lemmatized; a text is recommended only if ≥95% of its tokens are in the student's known set. Show coverage % on every text card.
4. Texts below 95% coverage are locked or flagged "too hard right now"; texts at 98%+ are marked "pleasure read".

## 3. The 18 Learning Principles

Compiled from Day & Bamford's Extensive Reading principles, Paul Nation's vocabulary research, and cognitive science. Each must map to at least one concrete feature.

| # | Principle | Platform implementation |
|---|-----------|------------------------|
| 1 | Reading material is easy (i+1, comprehensible input) | 95% coverage matching engine |
| 2 | Wide variety of topics and genres | Library tagged by topic/genre; variety nudges |
| 3 | Learners choose what they read | Free choice within matched texts; no forced sequence |
| 4 | Learners read as much as possible (volume) | Word-count goals, reading streaks, large library |
| 5 | Faster reading builds fluency | WPM tracking, optional timed re-reads of easy texts |
| 6 | Reading for meaning/pleasure, not translation | Comprehension questions about meaning, not form |
| 7 | Reading is individual and silent | Self-paced reader UI, no live group mechanics |
| 8 | Reading is its own reward | Minimal grading on reading itself; progress shown, not scored |
| 9 | Teacher orients and guides | Teacher dashboard: assign reading goals, see struggles |
| 10 | Repeated exposure — a word needs 8–12 meaningful encounters | Exposure counter per word; engine favors texts recycling "learning" words |
| 11 | Spaced repetition | SRS review queue for looked-up/learning words |
| 12 | Retrieval practice (testing effect) | Active-recall vocab exercises, not re-reading definitions |
| 13 | Words learned best in context | Flashcards show the sentence where the student met the word |
| 14 | Immediate feedback | Instant correction + explanation on all exercises |
| 15 | Incidental grammar acquisition through input | Grammar-in-context highlights in texts; no isolated drills |
| 16 | Interleaving & balance (Nation's four strands, reading-adapted) | Mix of new reading, fluency re-reading, vocab review per session |
| 17 | Goal setting & visible progress (self-efficacy) | Personal goals, progress charts, known-words growth curve |
| 18 | Desirable difficulty — effort within reach | Exercises target "learning" words at 85–90% expected success; coverage never below 95% |

## 4. Features

### 4.1 Student

**Onboarding**
- Signup, join class via teacher code.
- Vocabulary placement test (adaptive, lemma-based, frequency-stratified).
- Topic-interest survey to seed recommendations.

**Library & matching**
- Pre-loaded graded library (fiction, non-fiction, news-style, short stories), all leveled for low B1, each 300–1,500 words.
- Each text: coverage % for this student, estimated reading time, topic tags, word count.
- Recommendations: ≥95% coverage, favors texts recycling the student's "learning" words and preferred topics.

**Reader**
- Clean, distraction-free reading UI; adjustable font size.
- Tap/click any word → definition, L1 translation (optional), example sentence, audio pronunciation. Lookup adds word to "learning" set with its source sentence.
- Reading timer (active-time detection — pauses when tab inactive/idle).
- WPM computed per completed text.

**Post-reading activities**
- Comprehension quiz (4–6 meaning-focused questions).
- Vocabulary retrieval exercises on words from this text (fill-in-the-gap in original sentence, matching, multiple choice).
- Grammar-in-context: 1–2 highlighted structures from the text with short notice + one recognition exercise.
- All optional for pleasure reads (principle 8), encouraged for assigned reads.

**Vocabulary review (SRS)**
- Daily review queue: spaced repetition over "learning" words.
- Cards always carry original context sentence.
- Word graduates to "known" after N successful spaced retrievals (e.g. 5); demotes on repeated failure.

**Progress & stats (student-facing)**
- Total time on platform; time split by activity (reading / quizzes / vocab review).
- Words read (cumulative), texts completed, reading streak.
- Known-vocabulary size over time (growth curve).
- WPM trend.
- Comprehension accuracy trend.
- Weekly/monthly summaries; personal goals (e.g. "5,000 words read this week").

### 4.2 Teacher

- Create classes, invite students via code.
- Class dashboard: per-student time on platform, words read, vocab growth, comprehension accuracy, streaks, last activity.
- Per-activity time statistics for each student (reading vs. exercises vs. review).
- Assign texts or goals (word-count / texts-per-week) to class or individual — assignments still respect the 95% rule per student.
- Struggle flags: student with falling comprehension, stalled vocab growth, or inactivity ≥ X days.
- Export class report (CSV).

### 4.3 Platform / system

- Roles & auth: student, teacher (admin later).
- Text ingestion pipeline (internal): tokenize, lemmatize, frequency-profile, tag each library text; store per-lemma data for matching.
- Per-student word-state store: unknown → learning → known, with exposure counts and SRS scheduling data.
- Event-based activity tracking: session start/end, text opened/completed, lookup, exercise answered — all timestamped (feeds every statistic).
- Idle detection so "time spent" means active time.

## 5. Data model (high level)

- `User` (role), `Class`, `Enrollment`
- `Text` (content, lemma profile, tags, word count)
- `LemmaState` (user × lemma: status, exposures, SRS due date, source sentence)
- `ReadingSession` (user × text: active seconds, WPM, completed)
- `ExerciseAttempt` (type, correct, time)
- `Assignment`, `Goal`

## 6. Success metrics

- Median student vocab growth ≥ 8 new known word families / week.
- ≥ 80% of completed texts had ≥95% coverage at read time (matching engine works).
- Comprehension accuracy stays in 70–90% band (texts neither too easy to measure nor too hard).
- Weekly active reading time per student ≥ 60 min.

## 7. Open questions

- L1 translation language(s) for lookups — which language(s) do students share?
- Library size at launch (suggest ≥ 100 texts) and sourcing (public-domain / commissioned / licensed graded readers).
- Audio for full texts (read-along) — v1 or later?
- Gamification depth — streaks only, or points/leaderboards too? (Leaderboards can conflict with principle 8.)
