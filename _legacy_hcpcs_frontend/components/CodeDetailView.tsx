import { useEffect, useState } from "react";
import { getCodeDetail } from "../api";
import { useAppData } from "../state";
import type { CodeDetail, SearchResult } from "../types";
import { AddToCollectionModal } from "./AddToCollectionModal";
import { ModifierPickerSheet } from "./ModifierPickerSheet";

interface Props {
  code: string | null;
}

export function CodeDetailView({ code }: Props) {
  const [detail, setDetail] = useState<CodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [pickingModifiers, setPickingModifiers] = useState(false);
  /** Modifier suffix the user is currently composing for this code
   *  (e.g. "RR-KX"). Resets when the code changes. */
  const [modifiers, setModifiers] = useState("");
  const { isFavorite, toggleFavorite } = useAppData();

  useEffect(() => {
    setModifiers("");
    if (!code) {
      setDetail(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getCodeDetail(code)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        if (!d) setError(`Code "${code}" was not found.`);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch (e) {
      console.error("copy failed:", e);
    }
  }

  if (!code) {
    return (
      <div className="detail-pane detail-pane--empty">
        <p>Select a code to see its details.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="detail-pane detail-pane--empty">
        <p>Loading…</p>
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="detail-pane detail-pane--empty">
        <p>{error ?? "Not found."}</p>
      </div>
    );
  }

  const asItem: SearchResult = {
    code: detail.code,
    shortDescription: detail.shortDescription,
    description: detail.description,
    isBillable: detail.isBillable,
    category: detail.category,
    categoryName: detail.categoryName,
    coverageLabel: detail.coverageLabel,
  };

  const billingLine = modifiers ? `${detail.code}-${modifiers}` : detail.code;

  const fullDetail = [
    billingLine,
    detail.description,
    detail.isBillable ? "Billable" : "Non-billable",
    detail.categoryName &&
      `Category: ${detail.category} — ${detail.categoryName}`,
    detail.coverageLabel && `Coverage: ${detail.coverageLabel}`,
    detail.actionLabel && `Action: ${detail.actionLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fav = isFavorite(detail.code);

  return (
    <div className="detail-pane">
      <div className="detail-scroll">
        <div className="detail-hero">
          <div className="detail-hero__actions">
            <button
              className={`star-btn star-btn--lg${fav ? " star-btn--on" : ""}`}
              title={fav ? "Remove from favorites" : "Add to favorites"}
              onClick={() => toggleFavorite(asItem)}
            >
              {fav ? "★" : "☆"}
            </button>
            <button
              className="icon-btn"
              title="Add to collection"
              onClick={() => setAddingToCollection(true)}
            >
              ＋
            </button>
          </div>
          <div className="detail-hero__code">{billingLine}</div>
          <div className="detail-hero__desc">{detail.description}</div>
          <div className="detail-hero__badges">
            <span
              className={`badge ${
                detail.isBillable ? "badge--billable" : "badge--nonbillable"
              }`}
            >
              {detail.isBillable ? "Billable" : "Non-billable"}
            </span>
            {detail.category && (
              <span
                className="badge badge--category"
                title={detail.categoryName}
              >
                {detail.category}
              </span>
            )}
            {detail.coverageLabel && (
              <span className="badge badge--coverage">
                {detail.coverageLabel}
              </span>
            )}
          </div>
        </div>

        <div className="copy-group">
          <button className="copy-btn" onClick={() => copy("code", billingLine)}>
            Copy {modifiers ? "billing line" : "code"} · {billingLine}
          </button>
          <button
            className="copy-btn"
            onClick={() =>
              copy("codeDesc", `${billingLine} ${detail.description}`)
            }
          >
            Copy code + description
          </button>
          <button className="copy-btn" onClick={() => copy("full", fullDetail)}>
            Copy full detail
          </button>
          <button
            className="copy-btn copy-btn--accent"
            onClick={() => setPickingModifiers(true)}
          >
            {modifiers ? "Edit modifiers" : "＋ Add modifiers"}
          </button>
        </div>

        <div className="classification">
          <h3 className="classification__heading">Classification (CMS)</h3>
          {detail.category && detail.categoryName && (
            <ClassRow
              label="Category"
              value={`${detail.category} — ${detail.categoryName}`}
            />
          )}
          {detail.coverageLabel && (
            <ClassRow label="Coverage" value={detail.coverageLabel} />
          )}
          {detail.actionLabel && (
            <ClassRow label="Action" value={detail.actionLabel} />
          )}
          {detail.effectiveDate && (
            <ClassRow label="Effective" value={detail.effectiveDate} />
          )}
          {detail.terminationDate && (
            <ClassRow label="Terminated" value={detail.terminationDate} />
          )}
        </div>

        <NoteSection code={detail.code} />
      </div>

      <div className={`toast${copied ? " toast--show" : ""}`}>Copied</div>

      {addingToCollection && (
        <AddToCollectionModal
          item={asItem}
          modifiers={modifiers}
          onClose={() => setAddingToCollection(false)}
        />
      )}
      {pickingModifiers && (
        <ModifierPickerSheet
          code={detail.code}
          initialModifiers={modifiers}
          onApply={setModifiers}
          onClose={() => setPickingModifiers(false)}
        />
      )}
    </div>
  );
}

function ClassRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="class-row">
      <span className="class-row__label">{label}</span>
      <span className="class-row__value">{value}</span>
    </div>
  );
}

function NoteSection({ code }: { code: string }) {
  const { notes, setNote, deleteNote } = useAppData();
  const note = notes[code];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setEditing(false);
    setDraft("");
  }, [code]);

  function startEdit() {
    setDraft(note?.text ?? "");
    setEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed) {
      setNote(code, trimmed);
    } else if (note) {
      deleteNote(code);
    }
    setEditing(false);
  }

  return (
    <div className="note-section">
      <h3 className="classification__heading">Note</h3>
      {editing ? (
        <>
          <textarea
            className="note-input"
            value={draft}
            autoFocus
            placeholder="Add a note for this code…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="note-actions">
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={save}>
              Save
            </button>
          </div>
        </>
      ) : note ? (
        <>
          <div className="note-text">{note.text}</div>
          <div className="note-actions">
            <button className="btn" onClick={startEdit}>
              Edit
            </button>
            <button
              className="btn btn--danger"
              onClick={() => deleteNote(code)}
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        <button className="note-add" onClick={startEdit}>
          ＋ Add a note
        </button>
      )}
    </div>
  );
}
