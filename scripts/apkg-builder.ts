/**
 * Builds a small Anki package in the classic (.anki2) format, for the demo deck and the importer tests.
 * Two note types: "Basic" (Front/Back) and "Cloze" (Text with {{c1::…}}).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { strToU8, zipSync } from "fflate";

export type DemoNote = { basic: { front: string; back: string } } | { cloze: string };

const BASIC = 1_000_000_001;
const CLOZE = 1_000_000_002;
const DECK = 1_000_000_010;

export function buildApkg(deckName: string, notes: DemoNote[], media: Record<string, Uint8Array> = {}): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "apkg-build-"));
  const path = join(dir, "collection.anki2");
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
      CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
      CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    `);
    const models = {
      [BASIC]: {
        name: "Basic",
        type: 0,
        css: ".card { font-family: arial; font-size: 20px; text-align: center; }",
        flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }],
        tmpls: [{ name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: '{{FrontSide}}<hr id="answer">{{Back}}' }],
      },
      [CLOZE]: {
        name: "Cloze",
        type: 1,
        css: ".card { font-family: arial; font-size: 20px; text-align: center; } .cloze { font-weight: bold; color: blue; }",
        flds: [{ name: "Text", ord: 0 }, { name: "Back Extra", ord: 1 }],
        tmpls: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Back Extra}}" }],
      },
    };
    const decks = { 1: { name: "Default" }, [DECK]: { name: deckName } };
    db.prepare("INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')").run(JSON.stringify(models), JSON.stringify(decks));
    const addNote = db.prepare("INSERT INTO notes VALUES (?, ?, ?, 0, 0, '', ?, '', 0, 0, '')");
    const addCard = db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')");
    let cardId = 1;
    notes.forEach((n, i) => {
      const nid = 10_000 + i;
      if ("basic" in n) {
        addNote.run(nid, `g${nid}`, BASIC, `${n.basic.front}\x1f${n.basic.back}`);
        addCard.run(cardId++, nid, DECK, 0, i);
      } else {
        addNote.run(nid, `g${nid}`, CLOZE, `${n.cloze}\x1f`);
        const ords = [...new Set([...n.cloze.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]) - 1))];
        for (const ord of ords) addCard.run(cardId++, nid, DECK, ord, i);
      }
    });
  } finally {
    db.close();
  }
  const collection = readFileSync(path);
  rmSync(dir, { recursive: true, force: true });
  const names = Object.keys(media);
  return zipSync({
    "collection.anki2": new Uint8Array(collection),
    media: strToU8(JSON.stringify(Object.fromEntries(names.map((n, i) => [String(i), n])))),
    ...Object.fromEntries(names.map((n, i) => [String(i), media[n]])),
  });
}
