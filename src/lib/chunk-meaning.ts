import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "./db";
import { lookupDefinition } from "./dictionary";
import { glossaryEntry } from "./glossary";

/**
 * The back of a highlight-made card: a short learner definition of the chunk as used in this sentence, and an Uzbek
 * translation. Written by Claude when the server has an API key, otherwise taken from the dictionary.
 * Cached per (chunk, sentence) so the same highlight never costs twice.
 */

export type ChunkMeaning = { meaning: string; uz: string | null; source: "ai" | "dictionary" | "none" };

const MeaningSchema = z.object({
  meaning: z.string().describe("A short, simple English definition (B1 level, max 15 words) of the chunk as used in this sentence."),
  uz: z.string().describe("A short Uzbek (Latin script) translation of the chunk as used in this sentence."),
});

const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

async function fromAi(chunk: string, sentence: string): Promise<{ meaning: string; uz: string } | null> {
  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(MeaningSchema) },
      system:
        "You write flashcard backs for Uzbek students preparing for IELTS Academic Reading. Explain the highlighted chunk as it is used in the sentence: plain English a B1 learner understands, no example sentence, and keep multi-word chunks together (explain \"a myriad of\", not \"myriad\").",
      messages: [{ role: "user", content: `Sentence: ${sentence}\nHighlighted chunk: ${chunk}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return response.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`Chunk meaning: Claude API error ${error.status}`);
    else console.error("Chunk meaning failed", error);
    return null;
  }
}

async function fromDictionary(chunk: string): Promise<ChunkMeaning> {
  const word = chunk.toLowerCase().trim();
  const glossary = glossaryEntry(word);
  if (glossary) return { meaning: glossary.definition, uz: glossary.uz, source: "dictionary" };
  if (!/\s/.test(word)) {
    const entry = await lookupDefinition(word).catch(() => null);
    const first = entry?.meanings[0];
    if (first) return { meaning: first.definition, uz: null, source: "dictionary" };
  }
  return { meaning: "", uz: null, source: "none" };
}

export async function chunkMeaning(chunk: string, sentence: string): Promise<ChunkMeaning> {
  const key = createHash("sha1").update(`${chunk.toLowerCase()}\n${sentence}`).digest("hex");
  const cached = await db.chunkMeaning.findUnique({ where: { key } });
  if (cached) return { meaning: cached.meaning, uz: cached.uz, source: "ai" };

  if (aiConfigured()) {
    const ai = await fromAi(chunk, sentence);
    if (ai) {
      await db.chunkMeaning.create({ data: { key, meaning: ai.meaning, uz: ai.uz } }).catch(() => undefined);
      return { ...ai, source: "ai" };
    }
  }
  return fromDictionary(chunk);
}
