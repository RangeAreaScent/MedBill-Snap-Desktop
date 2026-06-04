import { useEffect, useMemo, useRef, useState } from "react";
import { searchModifiers } from "../api";
import type { ModifierSummary } from "../types";

export function ModifiersView() {
  const [all, setAll] = useState<ModifierSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    searchModifiers("")
      .then(setAll)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed) return all;
    return all.filter(
      (m) =>
        m.modifier.startsWith(trimmed) ||
        m.description.toUpperCase().includes(trimmed) ||
        m.shortDescription.toUpperCase().includes(trimmed) ||
        m.category.toUpperCase().includes(trimmed),
    );
  }, [query, all]);

  const detail = useMemo(
    () => (selected ? all.find((m) => m.modifier === selected) ?? null : null),
    [selected, all],
  );

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch (e) {
      console.error("copy failed:", e);
    }
  }

  return (
    <>
      <div className="list-pane">
        <div className="search-bar">
          <span className="search-bar__icon">⌕</span>
          <input
            ref={inputRef}
            className="search-bar__input"
            placeholder="Search modifiers (e.g. RR, KX, Anatomic)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              className="search-bar__clear"
              onClick={() => setQuery("")}
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
        <div className="list-scroll">
          {error && <div className="state-msg state-msg--error">{error}</div>}
          {!error && filtered.length === 0 && (
            <div className="state-msg">
              <p className="state-msg__title">No modifiers</p>
              <p>Nothing matches "{query}".</p>
            </div>
          )}
          {filtered.map((m) => (
            <ModifierRow
              key={m.modifier}
              modifier={m}
              selected={m.modifier === selected}
              onSelect={() => setSelected(m.modifier)}
            />
          ))}
        </div>
      </div>

      <div className="detail-pane">
        {detail ? (
          <div className="detail-scroll">
            <div className="detail-hero">
              <div className="detail-hero__code">{detail.modifier}</div>
              <div className="detail-hero__desc">{detail.description}</div>
              {detail.category && (
                <span className="badge badge--category">{detail.category}</span>
              )}
              {!detail.isCurrent && (
                <span className="badge badge--nonbillable">Discontinued</span>
              )}
            </div>
            <div className="copy-group">
              <button
                className="copy-btn"
                onClick={() => copy("modifier", detail.modifier)}
              >
                Copy modifier · {detail.modifier}
              </button>
              <button
                className="copy-btn"
                onClick={() =>
                  copy(
                    "full",
                    `${detail.modifier} ${detail.description}`,
                  )
                }
              >
                Copy modifier + description
              </button>
            </div>
            {detail.shortDescription && (
              <div className="classification">
                <h3 className="classification__heading">CMS short form</h3>
                <p className="note-text">{detail.shortDescription}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="detail-pane detail-pane--empty">
            <p>Select a modifier to see its detail.</p>
          </div>
        )}
        <div className={`toast${copied ? " toast--show" : ""}`}>Copied</div>
      </div>
    </>
  );
}

function ModifierRow({
  modifier,
  selected,
  onSelect,
}: {
  modifier: ModifierSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`code-row${selected ? " code-row--selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="code-row__main">
        <div className="code-row__top">
          <span className="code-row__code">{modifier.modifier}</span>
          {modifier.category && (
            <span className="badge badge--category">{modifier.category}</span>
          )}
          {!modifier.isCurrent && (
            <span className="badge badge--nonbillable">Discontinued</span>
          )}
        </div>
        <div className="code-row__desc">{modifier.description}</div>
      </div>
    </div>
  );
}
