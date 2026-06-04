import { useEffect, useRef, useState } from "react";
import { searchCodes } from "../api";
import { useAppData } from "../state";
import type { SearchResult } from "../types";
import { CodeRow } from "./CodeRow";

interface Props {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function SearchView({ selectedCode, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      searchCodes(trimmed)
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
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = query.trim();

  return (
    <div className="list-pane">
      <div className="search-bar">
        <span className="search-bar__icon">⌕</span>
        <input
          ref={inputRef}
          className="search-bar__input"
          placeholder="Search HCPCS code or description…"
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
        {!error && !trimmed && (
          <div className="state-msg">
            <p className="state-msg__title">Search HCPCS Level II codes</p>
            <p>
              Type a code (e.g. "E0114", "J3490", "G0008") or a description
              (e.g. "wheelchair").
            </p>
            <p>
              Abbreviations work too — try "DME", "CPAP", "AFO", "NEMT", "T2DM".
            </p>
          </div>
        )}
        {!error && trimmed && !loading && results.length === 0 && (
          <div className="state-msg">
            <p className="state-msg__title">No results</p>
            <p>No billable codes match "{trimmed}".</p>
          </div>
        )}
        {results.map((item) => (
          <CodeRow
            key={item.code}
            item={item}
            selected={item.code === selectedCode}
            favorite={isFavorite(item.code)}
            onSelect={() => onSelect(item.code)}
            onToggleFavorite={() => toggleFavorite(item)}
          />
        ))}
      </div>
    </div>
  );
}
