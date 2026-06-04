import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  getDrgDetail,
  getModifierDetail,
  getPosDetail,
} from "./api";
import type { Collection, CollectionItem, NoteMap } from "./types";

interface ExportEntry {
  /** "POS" / "MOD" / "DRG" — shown as a chip in the PDF header line and
   *  as the first CSV column. */
  kind: string;
  /** Display code (POS code, modifier letters, DRG number). */
  code: string;
  /** One-line label. */
  name: string;
  /** Longer description, when available. */
  description: string;
  /** User's note for this item, or empty. */
  note: string;
  /** Kind-specific compact summary, pre-formatted. */
  details: string;
}

const KIND_LABEL: Record<CollectionItem["kind"], string> = {
  pos: "POS",
  modifier: "MOD",
  drg: "DRG",
};

/** Enriches collection items with fresh DB details + the saved note.
 *  Re-fetching means renamed columns / updated weights are picked up at
 *  export time. */
async function buildEntries(
  c: Collection,
  notes: NoteMap,
): Promise<ExportEntry[]> {
  const out: ExportEntry[] = [];
  for (const item of c.items) {
    out.push(await enrich(item, notes));
  }
  return out;
}

async function enrich(
  item: CollectionItem,
  notes: NoteMap,
): Promise<ExportEntry> {
  const note = notes[item.key]?.text ?? "";
  if (item.kind === "pos") {
    const d = await getPosDetail(item.displayCode).catch(() => null);
    const parts: string[] = [];
    if (d?.effectiveDate) parts.push(`Effective ${d.effectiveDate}`);
    if (d?.lastUpdated) parts.push(`Updated ${d.lastUpdated}`);
    if (d?.notes) parts.push(d.notes);
    return {
      kind: KIND_LABEL.pos,
      code: item.displayCode,
      name: d?.name ?? item.name,
      description: d?.description ?? item.description,
      note,
      details: parts.join(" · "),
    };
  }
  if (item.kind === "modifier") {
    const d = await getModifierDetail(item.displayCode).catch(() => null);
    const parts: string[] = [];
    if (d?.category) parts.push(d.category);
    if (d?.effectiveYear != null) parts.push(`FY ${d.effectiveYear}`);
    if (d?.usageExample) parts.push(`Usage: ${d.usageExample}`);
    if (d?.billingImpact) parts.push(`Impact: ${d.billingImpact}`);
    return {
      kind: KIND_LABEL.modifier,
      code: item.displayCode,
      name: d?.name ?? item.name,
      description: d?.description ?? item.description,
      note,
      details: parts.join(" · "),
    };
  }
  // drg
  const d = await getDrgDetail(item.displayCode).catch(() => null);
  const parts: string[] = [];
  if (d?.mdcCode) {
    parts.push(
      `MDC ${d.mdcCode}${d.mdcName ? ` (${d.mdcName})` : ""}`,
    );
  }
  if (d?.drgType) parts.push(d.drgType);
  if (d?.severity) parts.push(d.severity);
  if (d?.relativeWeight != null) parts.push(`Wt ${d.relativeWeight.toFixed(4)}`);
  if (d?.geometricMeanLos != null)
    parts.push(`GMLOS ${d.geometricMeanLos.toFixed(2)}d`);
  if (d?.arithmeticMeanLos != null)
    parts.push(`AMLOS ${d.arithmeticMeanLos.toFixed(2)}d`);
  return {
    kind: KIND_LABEL.drg,
    code: item.displayCode,
    name: d?.name ?? item.name,
    description: "",
    note,
    details: parts.join(" · "),
  };
}

/** RFC 4180 quoting + CSV-injection guard: cells that start with =, +, -, or @
 *  get a leading apostrophe so Excel / Numbers do not evaluate user-supplied
 *  text (e.g. a collection name or a note) as a formula. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Sanitize a string for use as a default save-dialog filename. Strips
 *  Windows-forbidden chars (\ / : * ? " < > | + control chars) and trailing
 *  dots/spaces. Falls back to `fallback` for empty or DOS-reserved names. */
function safeFileBase(name: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  let cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim();
  cleaned = cleaned.replace(/[. ]+$/g, "");
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (!cleaned || reserved.test(cleaned)) cleaned = fallback;
  return cleaned.slice(0, 120);
}

const CSV_HEADER = ["Kind", "Code", "Name", "Description", "Notes", "Details"];

/** Opens a native save dialog and writes the collection as CSV.
 *  Returns false if the user cancelled. */
export async function exportCollectionCSV(
  c: Collection,
  notes: NoteMap,
): Promise<boolean> {
  const path = await save({
    defaultPath: `${safeFileBase(c.name, "collection")}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return false;

  const entries = await buildEntries(c, notes);
  const rows = [
    CSV_HEADER,
    ...entries.map((e) => [
      e.kind,
      e.code,
      e.name,
      e.description,
      e.note,
      e.details,
    ]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  await invoke("write_text_file", { path, content: csv });
  return true;
}

/** Opens a native save dialog and writes the collection as a PDF
 *  (generated natively in Rust). Returns false if the user cancelled. */
export async function exportCollectionPDF(
  c: Collection,
  notes: NoteMap,
): Promise<boolean> {
  const path = await save({
    defaultPath: `${safeFileBase(c.name, "collection")}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) return false;

  const entries = await buildEntries(c, notes);
  await invoke("export_pdf", { path, title: c.name, entries });
  return true;
}
