import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchDrgs,
  searchDrgsByIcd,
  searchModifiers,
  searchPos,
} from "../api";
import { useListKeyNav } from "../hooks/useListKeyNav";
import { useAppData } from "../state";
import type { LibraryItem, SearchMode, SearchResult } from "../types";
import { toLibraryItem } from "../types";
import { CodeRow } from "./CodeRow";

interface Props {
  selected: LibraryItem | null;
  onSelect: (item: LibraryItem) => void;
}

const MODES: { id: SearchMode; label: string; placeholder: string }[] = [
  {
    id: "pos",
    label: "POS",
    placeholder: "Search POS code or description (e.g. 11, office)",
  },
  {
    id: "modifier",
    label: "Modifier",
    placeholder: "Search HCPCS modifier (e.g. LT, bilateral)",
  },
  {
    id: "drg",
    label: "MS-DRG",
    placeholder: "Search DRG number or name (e.g. 291, heart failure)",
  },
  {
    id: "icdToDrg",
    label: "ICD → DRG",
    placeholder: "Enter principal ICD-10 (e.g. I50.9)",
  },
];

export function SearchView({ selected, onSelect }: Props) {
  const [mode, setMode] = useState<SearchMode>("pos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder = useMemo(
    () => MODES.find((m) => m.id === mode)?.placeholder ?? "Search…",
    [mode],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const runId = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++runId.current;
    const timer = setTimeout(() => {
      const promise =
        mode === "pos"
          ? searchPos(trimmed)
          : mode === "modifier"
          ? searchModifiers(trimmed)
          : mode === "drg"
          ? searchDrgs(trimmed)
          : searchDrgsByIcd(trimmed);
      promise
        .then((res) => {
          if (id !== runId.current) return;
          setResults(res);
          setError(null);
        })
        .catch((e) => {
          if (id !== runId.current) return;
          setError(String(e));
          setResults([]);
        })
        .finally(() => {
          if (id === runId.current) setLoading(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, mode]);

  const trimmed = query.trim();

  // Phase A — wire ↑↓ navigation. Results are SearchResult (tagged union),
  // but the hook needs items keyed by `LibraryItem.key`. Map once per
  // results change.
  const navItems = useMemo<LibraryItem[]>(
    () => results.map(toLibraryItem),
    [results],
  );
  useListKeyNav(navItems, selected?.key ?? null, onSelect);

  return (
    <div className="list-pane">
      <div className="mode-picker" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={`mode-tab ${mode === m.id ? "active" : ""}`}
            onClick={() => {
              setMode(m.id);
              setQuery("");
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <span className="search-bar__icon">⌕</span>
        <input
          ref={inputRef}
          className="search-bar__input"
          placeholder={placeholder}
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

      <ul className="list-scroll">
        {error && <li className="state-msg state-msg--error">{error}</li>}
        {!error && !trimmed && <EmptyHint mode={mode} />}
        {!error && trimmed && !loading && results.length === 0 && (
          <li className="state-msg">
            <p className="state-msg__title">No results</p>
            <p>Nothing matches "{trimmed}" in {modeLabel(mode)}.</p>
          </li>
        )}
        {results.map((r) => {
          const item = toLibraryItem(r);
          return (
            <CodeRow
              key={item.key}
              result={r}
              selected={selected?.key === item.key}
              isFavorite={isFavorite(item.key)}
              onClick={onSelect}
              onToggleFavorite={toggleFavorite}
            />
          );
        })}
      </ul>
    </div>
  );
}

function EmptyHint({ mode }: { mode: SearchMode }) {
  if (mode === "pos") {
    return (
      <li className="state-msg">
        <p className="state-msg__title">Place of Service codes</p>
        <p>50 CMS-defined POS codes — type "11" (office), "21" (inpatient), or any description.</p>
      </li>
    );
  }
  if (mode === "modifier") {
    return (
      <li className="state-msg">
        <p className="state-msg__title">HCPCS Level II modifiers</p>
        <p>47 alpha-numeric modifiers (LT, RT, GA, KX, …). Leave empty to list all.</p>
      </li>
    );
  }
  if (mode === "drg") {
    return (
      <li className="state-msg">
        <p className="state-msg__title">MS-DRGs (FY 2026)</p>
        <p>All 770 DRGs with FY 2026 relative weights. Try "291" or "heart failure".</p>
      </li>
    );
  }
  return (
    <li className="state-msg">
      <p className="state-msg__title">ICD → DRG reverse lookup</p>
      <p>Enter a principal ICD-10 (e.g. I50.9) to see the candidate DRG triplet.</p>
      <p>Use the <strong>CC/MCC Calculator</strong> tab for full impact analysis with secondary diagnoses.</p>
    </li>
  );
}

function modeLabel(mode: SearchMode): string {
  switch (mode) {
    case "pos":
      return "POS";
    case "modifier":
      return "modifiers";
    case "drg":
      return "MS-DRGs";
    case "icdToDrg":
      return "ICD → DRG routing";
  }
}
