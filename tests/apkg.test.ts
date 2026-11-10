import { describe, expect, it } from "vitest";
import { buildApkg } from "../scripts/apkg-builder";
import { linkMedia, renderCard, sanitizeHtml } from "../src/lib/anki-template";
import { readApkg } from "../src/lib/apkg";

describe("Anki templates", () => {
  it("renders fields, FrontSide and sections", () => {
    const card = renderCard("{{Front}}{{#Extra}}<p>{{Extra}}</p>{{/Extra}}", "{{FrontSide}}<hr>{{Back}}", { Front: "cat", Back: "mushuk", Extra: "" }, null);
    expect(card).toEqual({ front: "cat", back: "cat<hr>mushuk" });
  });

  it("renders cloze deletions per card", () => {
    const fields = { Text: "{{c1::Researchers}} found {{c2::weaknesses::problems}}." };
    expect(renderCard("{{cloze:Text}}", "{{cloze:Text}}", fields, 2)).toEqual({
      front: 'Researchers found <span class="cloze">[problems]</span>.',
      back: 'Researchers found <span class="cloze">weaknesses</span>.',
    });
    expect(renderCard("{{cloze:Text}}", "{{cloze:Text}}", fields, 3)).toBeNull();
  });

  it("removes scripts and handlers, and links media", () => {
    expect(sanitizeHtml('<img src="a.png" onerror="x()"><script>bad()</script>')).toBe('<img src="a.png">');
    expect(linkMedia('<img src="a b.png">[sound:hi.mp3]', "d1")).toBe('<img src="/api/media/d1/a%20b.png"><audio controls preload="none" src="/api/media/d1/hi.mp3"></audio>');
  });
});

describe(".apkg import", () => {
  it("reads notes, cloze cards, the deck name and media from a package", () => {
    const file = buildApkg(
      "Test deck",
      [{ basic: { front: 'bird <img src="bird.png">', back: "qush" } }, { cloze: "A {{c1::myriad}} of {{c2::stars}}." }],
      { "bird.png": new Uint8Array([137, 80, 78, 71]) },
    );
    const deck = readApkg(file, "fallback");
    expect(deck.name).toBe("Test deck");
    expect(deck.cards).toHaveLength(3);
    expect(deck.cards[0].back).toContain("qush");
    expect(deck.cards.map((c) => c.front).filter((f) => f.includes("[...]"))).toHaveLength(2);
    expect(deck.media).toEqual([{ name: "bird.png", mime: "image/png", data: Buffer.from([137, 80, 78, 71]) }]);
    expect(Object.values(deck.css).join()).toContain(".cloze");
  });

  it("rejects files that are not Anki packages", () => {
    expect(() => readApkg(new Uint8Array([1, 2, 3]), "x")).toThrow();
  });
});
