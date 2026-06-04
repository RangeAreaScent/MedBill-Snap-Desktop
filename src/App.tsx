import { useCallback, useEffect, useMemo, useState } from "react";
import {
  searchDrgs,
  searchDrgsByIcd,
  searchModifiers,
  searchPos,
} from "./api";
import type { SearchMode, SearchResult } from "./types";

const MODES: { id: SearchMode; label: string; placeholder: string }[] = [
  { id: "pos", label: "POS", placeholder: "Search POS (e.g. 11, office)" },
  { id: "modifier", label: "Modifier", placeholder: "Search HCPCS modifier (e.g. LT, bilateral)" },
  { id: "drg", label: "MS-DRG", placeholder: "Search DRG (e.g. 291, heart failure)" },
  { id: "icdToDrg", label: "ICD → DRG", placeholder: "Enter principal ICD-10 (e.g. I50.9)" },
];

export default function App() {
  const [mode, setMode] = useState<SearchMode>("pos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(
    () => MODES.find((m) => m.id === mode)?.placeholder ?? "Search…",
    [mode],
  );

  const runSearch = useCallback(
    async (q: string, m: SearchMode) => {
      setLoading(true);
      setError(null);
      try {
        let res: SearchResult[];
        switch (m) {
          case "pos":
            res = await searchPos(q);
            break;
          case "modifier":
            res = await searchModifiers(q);
            break;
          case "drg":
            res = await searchDrgs(q);
            break;
          case "icdToDrg":
            res = await searchDrgsByIcd(q);
            break;
        }
        setResults(res);
      } catch (e) {
        setError(String(e));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      runSearch(query, mode);
    }, 150);
    return () => clearTimeout(t);
  }, [query, mode, runSearch]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>MedBill Snap</h1>
        <p className="tagline">POS · HCPCS Modifier · MS-DRG · ICD→DRG — offline.</p>
      </header>

      <div className="mode-picker" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={`mode-tab ${mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <input
        className="search-input"
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {loading && <div className="status">Searching…</div>}
      {error && <div className="status error">Error: {error}</div>}

      <ul className="result-list">
        {results.map(renderRow)}
      </ul>

      {!loading && !error && query.trim() && results.length === 0 && (
        <div className="status muted">No results.</div>
      )}
    </div>
  );
}

function renderRow(r: SearchResult) {
  switch (r.kind) {
    case "pos":
      return (
        <li key={`pos:${r.code}`} className="row row-pos">
          <span className="chip chip-pos">POS</span>
          <span className="code">{r.code}</span>
          <span className="name">{r.name}</span>
          <span className="desc">{r.description}</span>
        </li>
      );
    case "modifier":
      return (
        <li key={`mod:${r.code}`} className="row row-mod">
          <span className="chip chip-mod">MOD</span>
          <span className="code">{r.code}</span>
          <span className="name">{r.name}</span>
          <span className="desc">{r.description}</span>
        </li>
      );
    case "drg":
      return (
        <li key={`drg:${r.number}`} className="row row-drg">
          <span className="chip chip-drg">DRG</span>
          <span className="code">{r.number}</span>
          <span className="name">{r.name}</span>
          {r.severity && <span className="meta">{r.severity}</span>}
          {r.relativeWeight != null && (
            <span className="meta">Wt {r.relativeWeight.toFixed(4)}</span>
          )}
        </li>
      );
  }
}
