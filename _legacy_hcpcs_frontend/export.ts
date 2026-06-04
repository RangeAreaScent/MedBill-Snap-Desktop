import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getCodeDetail } from "./api";
import type { Collection, NoteMap } from "./types";

interface ExportEntry {
  code: string;
  description: string;
  note: string;
  billable: string;
  category: string;
  categoryName: string;
  coverage: string;
  /** Joined modifier suffix (e.g. "RR-KX"), or empty. */
  modifiers: string;
}

/** Enriches collection items with category + coverage + the saved note.
 *  Fresh values come from the bundled DB so renamed categories or coverage
 *  updates are picked up at export time. */
async function buildEntries(
  c: Collection,
  notes: NoteMap,
): Promise<ExportEntry[]> {
  const details = await Promise.all(
    c.items.map((i) => getCodeDetail(i.code).catch(() => null)),
  );
  return c.items.map((item, idx) => {
    const d = details[idx];
    return {
      code: item.code,
      description: d?.description ?? item.description,
      note: notes[item.code]?.text ?? "",
      billable: (d?.isBillable ?? item.isBillable) ? "Yes" : "No",
      category: d?.category ?? item.category,
      categoryName: d?.categoryName ?? item.categoryName,
      coverage: d?.coverageLabel ?? "",
      modifiers: item.modifiers ?? "",
    };
  });
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

const CSV_HEADER = [
  "Code",
  "Modifiers",
  "Billing Line",
  "Description",
  "Note",
  "Billable",
  "Category",
  "Category Name",
  "Coverage",
];

function billingLine(code: string, mods: string): string {
  return mods.length > 0 ? `${code}-${mods}` : code;
}

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
      e.code,
      e.modifiers,
      billingLine(e.code, e.modifiers),
      e.description,
      e.note,
      e.billable,
      e.category,
      e.categoryName,
      e.coverage,
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
