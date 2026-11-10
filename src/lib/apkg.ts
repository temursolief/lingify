import "server-only";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdDecompressSync } from "node:zlib";
import { unzipSync } from "fflate";
import { renderCard, sanitizeHtml } from "./anki-template";

/**
 * Reads an Anki package (.apkg) exported by Anki desktop: the old format (collection.anki2 / .anki21 with note types
 * as JSON in the `col` table) and the current one (zstd-compressed collection.anki21b with note types in their own
 * tables). Returns rendered cards and media, ready to store.
 */

export type ImportedDeck = {
  name: string;
  css: Record<string, string>;
  cards: { front: string; back: string; noteType: string; position: number }[];
  media: { name: string; mime: string; data: Buffer }[];
};

const ZSTD = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b: Uint8Array) => ZSTD.every((v, i) => b[i] === v);
const unz = (b: Uint8Array) => (isZstd(b) ? new Uint8Array(zstdDecompressSync(b)) : b);

/* ---- a tiny protobuf reader: enough for Anki's note type, template and media messages ---- */

type Proto = Map<number, (number | Uint8Array)[]>;

function readProto(buf: Uint8Array): Proto {
  const out: Proto = new Map();
  let i = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[i++];
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };
  while (i < buf.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let value: number | Uint8Array;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const len = varint();
      value = buf.subarray(i, i + len);
      i += len;
    } else if (wire === 1) {
      value = 0;
      i += 8;
    } else if (wire === 5) {
      value = 0;
      i += 4;
    } else break;
    out.set(field, [...(out.get(field) ?? []), value]);
  }
  return out;
}

const text = (p: Proto, field: number) => {
  const v = p.get(field)?.[0];
  return v instanceof Uint8Array ? new TextDecoder().decode(v) : "";
};
const num = (p: Proto, field: number) => {
  const v = p.get(field)?.[0];
  return typeof v === "number" ? v : 0;
};

/* ---- note types ---- */

type NoteType = { id: string; name: string; cloze: boolean; css: string; fields: string[]; templates: { ord: number; qfmt: string; afmt: string }[] };

function noteTypes(db: DatabaseSync): Map<string, NoteType> {
  const map = new Map<string, NoteType>();
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'").get();
  if (hasTable) {
    for (const row of db.prepare("SELECT id, name, config FROM notetypes").all() as { id: number | bigint; name: string; config: Uint8Array }[]) {
      const cfg = readProto(row.config);
      map.set(String(row.id), { id: String(row.id), name: row.name, cloze: num(cfg, 1) === 1, css: text(cfg, 3), fields: [], templates: [] });
    }
    for (const f of db.prepare("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord").all() as { ntid: number | bigint; ord: number; name: string }[]) {
      map.get(String(f.ntid))?.fields.push(f.name);
    }
    for (const t of db.prepare("SELECT ntid, ord, config FROM templates ORDER BY ntid, ord").all() as { ntid: number | bigint; ord: number; config: Uint8Array }[]) {
      const cfg = readProto(t.config);
      map.get(String(t.ntid))?.templates.push({ ord: t.ord, qfmt: text(cfg, 1), afmt: text(cfg, 2) });
    }
    return map;
  }
  const { models } = db.prepare("SELECT models FROM col").get() as { models: string };
  for (const [id, m] of Object.entries(JSON.parse(models) as Record<string, { name: string; type: number; css: string; flds: { name: string; ord: number }[]; tmpls: { ord: number; qfmt: string; afmt: string }[] }>)) {
    map.set(id, {
      id,
      name: m.name,
      cloze: m.type === 1,
      css: m.css ?? "",
      fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
      templates: m.tmpls.map((t) => ({ ord: t.ord, qfmt: t.qfmt, afmt: t.afmt })),
    });
  }
  return map;
}

function deckNames(db: DatabaseSync): Map<string, string> {
  const map = new Map<string, string>();
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'").get();
  if (hasTable) {
    for (const d of db.prepare("SELECT id, name FROM decks").all() as { id: number | bigint; name: string }[]) map.set(String(d.id), d.name.replaceAll("\x1f", "::"));
  } else {
    const { decks } = db.prepare("SELECT decks FROM col").get() as { decks: string };
    for (const [id, d] of Object.entries(JSON.parse(decks) as Record<string, { name: string }>)) map.set(id, d.name);
  }
  return map;
}

/* ---- media ---- */

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm",
};

function mediaFiles(files: Record<string, Uint8Array>) {
  const manifest = files["media"];
  if (!manifest) return [];
  let names: [string, string][] = [];
  const raw = unz(manifest);
  if (raw[0] === 0x7b /* { */) {
    names = Object.entries(JSON.parse(new TextDecoder().decode(raw)) as Record<string, string>);
  } else {
    // current format: MediaEntries { repeated MediaEntry entries = 1 { string name = 1; … } }
    const entries = readProto(raw).get(1) ?? [];
    names = entries.map((e, i) => [String(i), text(readProto(e as Uint8Array), 1)]);
  }
  return names.flatMap(([index, name]) => {
    const data = files[index];
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!data || !MIME[ext]) return [];
    return [{ name, mime: MIME[ext], data: Buffer.from(unz(data)) }];
  });
}

/* ---- the package ---- */

export function readApkg(file: Uint8Array, fallbackName: string): ImportedDeck {
  const files = unzipSync(file);
  const collection = files["collection.anki21b"] ? unz(files["collection.anki21b"]) : (files["collection.anki21"] ?? files["collection.anki2"]);
  if (!collection) throw new Error("This file has no Anki collection inside. Export the deck from Anki as an .apkg file.");

  const dir = mkdtempSync(join(tmpdir(), "apkg-"));
  const path = join(dir, "collection.sqlite");
  writeFileSync(path, collection);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const types = noteTypes(db);
    const decks = deckNames(db);
    const notes = new Map(
      (db.prepare("SELECT id, mid, flds FROM notes").all() as { id: number | bigint; mid: number | bigint; flds: string }[]).map((n) => [String(n.id), n]),
    );
    const rows = db.prepare("SELECT nid, did, ord, due, type FROM cards ORDER BY type, due, id").all() as {
      nid: number | bigint;
      did: number | bigint;
      ord: number;
      due: number | bigint;
    }[];

    const deckCount = new Map<string, number>();
    const cards: ImportedDeck["cards"] = [];
    for (const [position, row] of rows.entries()) {
      const note = notes.get(String(row.nid));
      const type = note && types.get(String(note.mid));
      if (!note || !type) continue;
      const values = note.flds.split("\x1f");
      const fields = Object.fromEntries(type.fields.map((f, i) => [f, values[i] ?? ""]));
      const template = type.cloze ? type.templates[0] : type.templates.find((t) => t.ord === row.ord);
      if (!template) continue;
      const card = renderCard(template.qfmt, template.afmt, fields, type.cloze ? row.ord + 1 : null);
      if (!card) continue;
      cards.push({ front: card.front, back: card.back, noteType: type.id, position });
      deckCount.set(String(row.did), (deckCount.get(String(row.did)) ?? 0) + 1);
    }
    if (!cards.length) throw new Error("No cards could be read from this deck.");

    const mainDeck = [...deckCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const name = (mainDeck && decks.get(mainDeck)) || fallbackName;
    const css = Object.fromEntries([...types.values()].map((t) => [t.id, sanitizeHtml(t.css)]));
    return { name: name === "Default" ? fallbackName : name, css, cards, media: mediaFiles(files) };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
