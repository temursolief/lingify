import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_PASSAGE, EXAMPLE_PASSAGE_WITH_DECK, MAX_DECK_CARDS, parsePassageJson, passageSchema } from "../src/lib/passage-format";
import { deckCardRows } from "../src/lib/vocab-cards";

const withCards = (cards: unknown[], extra: object = {}) => JSON.stringify({ ...EXAMPLE_PASSAGE, deck: { cards, ...extra } });
const errorsOf = (raw: string) => {
  const r = parsePassageJson(raw);
  return r.ok ? [] : r.errors;
};

describe("passage file with flashcards", () => {
  it("accepts both shapes: the passage alone, and the passage with a deck", () => {
    const plain = parsePassageJson(JSON.stringify(EXAMPLE_PASSAGE));
    expect(plain.ok && plain.data.deck).toBeFalsy();
    const full = parsePassageJson(JSON.stringify(EXAMPLE_PASSAGE_WITH_DECK));
    expect(full.ok && full.data.deck?.cards).toHaveLength(4);
  });

  it("ships example files that match the examples in the code and validate", () => {
    for (const [file, example] of [
      ["passage-example.json", EXAMPLE_PASSAGE],
      ["passage-with-deck-example.json", EXAMPLE_PASSAGE_WITH_DECK],
    ] as const) {
      const onDisk = JSON.parse(readFileSync(`public/samples/${file}`, "utf8"));
      expect(onDisk).toEqual(example);
      expect(passageSchema.safeParse(onDisk).success).toBe(true);
    }
  });

  it("explains what is wrong with a card, by position", () => {
    expect(errorsOf(withCards([{ word: "luxury" }])).join("\n")).toContain("deck → cards → 0 → meaning: Give the word a meaning");
    expect(errorsOf(withCards([{ meaning: "x" }])).join("\n")).toContain("cards → 0 → word");
    expect(errorsOf(withCards([{ front: "Q" }])).join("\n")).toContain("cards → 0 → back: A card with a front needs a back");
    expect(errorsOf(withCards([{ word: "a", meaning: "b", front: "c", back: "d" }])).join("\n")).toContain("either word + meaning or front + back");
    expect(errorsOf(withCards([])).length).toBeGreaterThan(0);
  });

  it("refuses the same word twice, ignoring case, and too many cards", () => {
    expect(errorsOf(withCards([{ word: "Luxury", meaning: "a" }, { word: "luxury", meaning: "b" }])).join("\n")).toContain("“luxury” is already card 1");
    const many = Array.from({ length: MAX_DECK_CARDS + 1 }, (_, i) => ({ word: `w${i}`, meaning: "m" }));
    expect(errorsOf(withCards(many)).length).toBeGreaterThan(0);
  });

  it("makes cards that look like highlight cards: blanked sentence in front, meaning and Uzbek behind", () => {
    const parsed = parsePassageJson(JSON.stringify(EXAMPLE_PASSAGE_WITH_DECK));
    if (!parsed.ok) throw new Error("example must parse");
    const rows = deckCardRows(parsed.data.deck!);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(rows[0]).toMatchObject({ noteType: "chunk", ankiNoteId: "json:0" });
    expect(rows[0]!.front).toBe('<div class="sentence">For centuries glass remained a <span class="cloze">[...]</span>.</div>');
    expect(rows[0]!.back).toContain('<div class="meaning">something expensive');
    expect(rows[0]!.back).toContain("O‘zbekcha: hashamat");
    // no example: the word itself is the front
    expect(rows[2]!.front).toBe('<div class="chunk">fibre-optic</div>');
    expect(rows[3]).toMatchObject({ noteType: "basic" });
  });

  it("escapes words and strips scripts from free cards, since students see them", () => {
    const rows = deckCardRows({
      cards: [
        { word: "a<b", meaning: "x & y" },
        { front: '<b onclick="steal()">Q</b><script>alert(1)</script>', back: '<a href="javascript:alert(1)">A</a>' },
      ],
    });
    expect(rows[0]!.front).toContain("a&lt;b");
    expect(rows[0]!.back).toContain("x &amp; y");
    expect(rows[1]!.front).not.toMatch(/script|onclick/i);
    expect(rows[1]!.back).not.toContain("javascript:");
  });
});
