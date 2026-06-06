import { useEffect, useState } from "react";
import {
  classifyIcd,
  getDrgDetail,
  getModifierDetail,
  getPosDetail,
} from "../api";
import { useAppData } from "../state";
import type {
  CcMccEntry,
  DrgDetail,
  LibraryItem,
  ModifierDetail,
  PosDetail,
} from "../types";

interface Props {
  item: LibraryItem;
  onAddToCollection?: () => void;
  /** Phase B narrow-window: when set, the detail view is acting as an
   *  overlay over the list pane; show a Back button to dismiss it. */
  onClose?: () => void;
}

type Loaded =
  | { kind: "pos"; data: PosDetail }
  | { kind: "modifier"; data: ModifierDetail }
  | { kind: "drg"; data: DrgDetail };

export function CodeDetailView({ item, onAddToCollection, onClose }: Props) {
  const { isFavorite, toggleFavorite, notes, setNote, deleteNote } =
    useAppData();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState<string>(
    notes[item.key]?.text ?? "",
  );

  useEffect(() => {
    setLoading(true);
    setLoaded(null);
    let cancelled = false;
    const promise: Promise<Loaded | null> =
      item.kind === "pos"
        ? getPosDetail(item.displayCode).then((d) =>
            d ? { kind: "pos", data: d } : null,
          )
        : item.kind === "modifier"
        ? getModifierDetail(item.displayCode).then((d) =>
            d ? { kind: "modifier", data: d } : null,
          )
        : getDrgDetail(item.displayCode).then((d) =>
            d ? { kind: "drg", data: d } : null,
          );
    promise
      .then((d) => {
        if (!cancelled) setLoaded(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    setNoteDraft(notes[item.key]?.text ?? "");
    return () => {
      cancelled = true;
    };
  }, [item.key, item.kind, item.displayCode, notes]);

  function commitNote() {
    const trimmed = noteDraft.trim();
    if (trimmed) setNote(item.key, trimmed);
    else deleteNote(item.key);
  }

  return (
    <div className="detail-view">
      {onClose && (
        <button className="detail-back" onClick={onClose}>
          ‹ Back
        </button>
      )}
      <header className="detail-head">
        <span className={`code-chip code-chip--${item.kind}`}>
          {item.kind.toUpperCase()}
        </span>
        <h2 className="detail-code">{item.displayCode}</h2>
        <button
          className={`star-btn${isFavorite(item.key) ? " star-btn--on" : ""}`}
          onClick={() => toggleFavorite(item)}
          aria-label="Toggle favorite"
        >
          {isFavorite(item.key) ? "★" : "☆"}
        </button>
        {onAddToCollection && (
          <button className="btn" onClick={onAddToCollection}>
            + Collection
          </button>
        )}
      </header>

      <h3 className="detail-name">{item.name}</h3>

      {loading && <div className="status">Loading…</div>}

      {loaded?.kind === "pos" && <PosBody d={loaded.data} />}
      {loaded?.kind === "modifier" && <ModifierBody d={loaded.data} />}
      {loaded?.kind === "drg" && <DrgBody d={loaded.data} />}
      {item.kind === "drg" && !loading && <DrgIcdHint />}

      <section className="detail-section">
        <h4>Notes</h4>
        <textarea
          className="note-input"
          value={noteDraft}
          placeholder="Personal note for this item…"
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitNote}
          rows={3}
        />
      </section>
    </div>
  );
}

function PosBody({ d }: { d: PosDetail }) {
  return (
    <>
      <p className="detail-desc">{d.description}</p>
      <dl className="detail-grid">
        {d.notes && (
          <>
            <dt>Notes</dt>
            <dd>{d.notes}</dd>
          </>
        )}
        {d.effectiveDate && (
          <>
            <dt>Effective</dt>
            <dd>{d.effectiveDate}</dd>
          </>
        )}
        {d.lastUpdated && (
          <>
            <dt>Last updated</dt>
            <dd>{d.lastUpdated}</dd>
          </>
        )}
      </dl>
    </>
  );
}

function ModifierBody({ d }: { d: ModifierDetail }) {
  return (
    <>
      <p className="detail-desc">{d.description}</p>
      <dl className="detail-grid">
        {d.usageExample && (
          <>
            <dt>Usage</dt>
            <dd>{d.usageExample}</dd>
          </>
        )}
        {d.billingImpact && (
          <>
            <dt>Billing impact</dt>
            <dd>{d.billingImpact}</dd>
          </>
        )}
        {d.category && (
          <>
            <dt>Category</dt>
            <dd>{d.category}</dd>
          </>
        )}
        {d.effectiveYear != null && (
          <>
            <dt>Effective FY</dt>
            <dd>{d.effectiveYear}</dd>
          </>
        )}
      </dl>
    </>
  );
}

function DrgBody({ d }: { d: DrgDetail }) {
  return (
    <>
      <dl className="detail-grid">
        {d.severity && (
          <>
            <dt>Severity</dt>
            <dd>{d.severity}</dd>
          </>
        )}
        {d.drgType && (
          <>
            <dt>Type</dt>
            <dd>{d.drgType}</dd>
          </>
        )}
        {d.mdcCode && (
          <>
            <dt>MDC</dt>
            <dd>
              {d.mdcCode}
              {d.mdcName ? ` — ${d.mdcName}` : ""}
            </dd>
          </>
        )}
        {d.relativeWeight != null && (
          <>
            <dt>Relative weight</dt>
            <dd>{d.relativeWeight.toFixed(4)}</dd>
          </>
        )}
        {d.geometricMeanLos != null && (
          <>
            <dt>GMLOS</dt>
            <dd>{d.geometricMeanLos.toFixed(2)} days</dd>
          </>
        )}
        {d.arithmeticMeanLos != null && (
          <>
            <dt>AMLOS</dt>
            <dd>{d.arithmeticMeanLos.toFixed(2)} days</dd>
          </>
        )}
        {d.effectiveFy != null && (
          <>
            <dt>FY</dt>
            <dd>{d.effectiveFy}</dd>
          </>
        )}
        {d.notes && (
          <>
            <dt>Notes</dt>
            <dd>{d.notes}</dd>
          </>
        )}
      </dl>
    </>
  );
}

function DrgIcdHint() {
  return (
    <p className="detail-hint">
      💡 Try the <strong>CC/MCC Calculator</strong> tab to see how secondary
      diagnoses would route a principal diagnosis to this DRG triplet.
    </p>
  );
}

/** Standalone ICD classification badge — used by the calculator view too. */
export function CcMccBadge({ entry }: { entry: CcMccEntry }) {
  const label =
    entry.level === "mcc" ? "MCC" : entry.level === "cc" ? "CC" : "none";
  return (
    <span className={`cc-mcc-badge cc-mcc-badge--${entry.level}`}>{label}</span>
  );
}

/** Convenience caller used by the calculator's pill-list. */
export async function classifyOne(icd: string): Promise<CcMccEntry> {
  return await classifyIcd(icd);
}
