/**
 * Checks every library text against simulated learners who know the top N lemmas,
 * and lists the rarest words so authors can simplify texts that are too hard for early B1.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { tokenize } from "../src/lib/nlp";
import { frequencyRank, lemmaRanks } from "../src/lib/frequency";
import { coverageOf } from "../src/lib/texts";

const LEARNER_SIZES = [2000, 2500, 3000];
const dir = path.resolve(import.meta.dirname, "../content/texts");
const only = process.argv[2];

const knownSets = LEARNER_SIZES.map((n) => new Set(lemmaRanks.slice(0, n).map(([l]) => l)));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  if (only && !file.includes(only)) continue;
  const text = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const { lemmaCounts, wordCount } = tokenize(text.paragraphs);
  const coverages = knownSets.map((known) => coverageOf(lemmaCounts, known).coverage);
  const rare = Object.entries(lemmaCounts)
    .map(([lemma, count]) => ({ lemma, count, rank: frequencyRank(lemma) ?? 99999 }))
    .filter((r) => r.rank >= 2500)
    .sort((a, b) => b.rank - a.rank)
    .map((r) => `${r.lemma}(${r.rank === 99999 ? "?" : r.rank}${r.count > 1 ? `x${r.count}` : ""})`);
  console.log(
    `${text.slug.padEnd(34)} ${String(wordCount).padStart(4)}w  ` +
      LEARNER_SIZES.map((n, i) => `${n / 1000}k:${(coverages[i] * 100).toFixed(1)}%`).join("  "),
  );
  console.log(`   rare: ${rare.join(" ")}`);
}
