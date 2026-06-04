import { useEffect, useMemo, useState } from "react";
import { searchModifiers } from "../api";
import type { ModifierSummary } from "../types";
import { Modal } from "./Modal";

interface Props {
  code: string;
  initialModifiers?: string;
  onClose: () => void;
  /** Called with the joined suffix (e.g. "RR-KX") or "" if the user cleared
   *  the picker. */
  onApply?: (modifiers: string) => void;
}

/** Browse + pick HCPCS modifiers and copy the combined billing line
 *  (`code-mod1-mod2-…`) in one click. */
export function ModifierPickerSheet({
  code,
  initialModifiers = "",
  onClose,
  onApply,
}: Props) {
  const [all, setAll] = useState<ModifierSummary[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    initialModifiers.length > 0
      ? initialModifiers.split("-").filter(Boolean)
      : [],
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    searchModifiers("").then(setAll).catch((e) => console.error(e));
  }, []);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed) return all.filter((m) => m.isCurrent);
    return all.filter(
      (m) =>
        m.modifier.startsWith(trimmed) ||
        m.description.toUpperCase().includes(trimmed) ||
        m.shortDescription.toUpperCase().includes(trimmed),
    );
  }, [query, all]);

  function toggle(mod: string) {
    setSelected((s) =>
      s.includes(mod) ? s.filter((m) => m !== mod) : [...s, mod],
    );
  }

  function move(mod: string, dir: -1 | 1) {
    setSelected((s) => {
      const idx = s.indexOf(mod);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= s.length) return s;
      const out = [...s];
      [out[idx], out[next]] = [out[next], out[idx]];
      return out;
    });
  }

  const suffix = selected.join("-");
  const billingLine = suffix ? `${code}-${suffix}` : code;

  async function copy() {
    try {
      await navigator.clipboard.writeText(billingLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.error("copy failed:", e);
    }
  }

  function apply() {
    onApply?.(suffix);
    onClose();
  }

  return (
    <Modal
      title={`Modifiers for ${code}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn"
            onClick={copy}
            disabled={selected.length === 0}
            title="Copy billing line"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          {onApply && (
            <button className="btn btn--primary" onClick={apply}>
              Apply
            </button>
          )}
        </>
      }
    >
      <div className="modifier-line">
        <span className="modifier-line__label">Billing line</span>
        <code className="modifier-line__value">{billingLine}</code>
      </div>

      {selected.length > 0 && (
        <div className="modifier-chips">
          {selected.map((mod, i) => (
            <span key={mod} className="modifier-chip">
              <span className="modifier-chip__code">{mod}</span>
              <button
                className="modifier-chip__btn"
                title="Move left"
                onClick={() => move(mod, -1)}
                disabled={i === 0}
              >
                ‹
              </button>
              <button
                className="modifier-chip__btn"
                title="Move right"
                onClick={() => move(mod, 1)}
                disabled={i === selected.length - 1}
              >
                ›
              </button>
              <button
                className="modifier-chip__btn modifier-chip__btn--x"
                title="Remove"
                onClick={() => toggle(mod)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className="text-input"
        autoFocus
        placeholder="Filter modifiers (e.g. RR, KX, Anatomic)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />

      <div className="pick-list pick-list--tall">
        {filtered.map((m) => {
          const on = selected.includes(m.modifier);
          return (
            <button
              key={m.modifier}
              className={`pick-row${on ? " pick-row--on" : ""}`}
              onClick={() => toggle(m.modifier)}
            >
              <span className="pick-row__code">{m.modifier}</span>
              <span className="pick-row__name">{m.description}</span>
              <span className="pick-row__check">{on ? "✓" : "＋"}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="modal-empty">No modifiers match.</p>
        )}
      </div>
    </Modal>
  );
}
