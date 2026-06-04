import { useEffect, useRef, useState } from "react";
import { searchCodes } from "../api";
import { useAppData } from "../state";
import type { SearchResult } from "../types";
import { Modal } from "./Modal";

interface Props {
  collectionId: string;
  onClose: () => void;
}

export function AddCodeModal({ collectionId, onClose }: Props) {
  const { addToCollection, removeFromCollection, isInCollection } = useAppData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const runId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const id = ++runId.current;
    const timer = setTimeout(() => {
      searchCodes(trimmed, 30)
        .then((res) => {
          if (id === runId.current) setResults(res);
        })
        .catch((e) => console.error("search failed:", e));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Modal
      title="Add code"
      onClose={onClose}
      footer={
        <button className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <input
        className="text-input"
        autoFocus
        placeholder="Search HCPCS code or description…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />
      <div className="pick-list pick-list--tall">
        {results.map((r) => {
          const inside = isInCollection(collectionId, r.code);
          return (
            <button
              key={r.code}
              className="pick-row"
              onClick={() =>
                inside
                  ? removeFromCollection(collectionId, r.code)
                  : addToCollection(collectionId, r)
              }
            >
              <span className="pick-row__code">{r.code}</span>
              <span className="pick-row__name">{r.description}</span>
              <span className="pick-row__check">{inside ? "✓" : "＋"}</span>
            </button>
          );
        })}
        {query.trim() && results.length === 0 && (
          <p className="modal-empty">No results.</p>
        )}
      </div>
    </Modal>
  );
}
