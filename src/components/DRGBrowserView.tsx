import { useEffect, useState } from "react";
import { listDrgsByMdc, listMdcs } from "../api";
import type { LibraryItem, MdcCategory, SearchResult } from "../types";
import { toLibraryItem } from "../types";
import { CodeRow } from "./CodeRow";
import { useAppData } from "../state";

interface Props {
  selected: LibraryItem | null;
  onSelect: (item: LibraryItem) => void;
}

export function DRGBrowserView({ selected, onSelect }: Props) {
  const [mdcs, setMdcs] = useState<MdcCategory[]>([]);
  const [openMdc, setOpenMdc] = useState<string | null>(null);
  const [mdcDrgs, setMdcDrgs] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useAppData();

  useEffect(() => {
    setLoading(true);
    listMdcs()
      .then(setMdcs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function expandMdc(code: string) {
    if (openMdc === code) {
      setOpenMdc(null);
      return;
    }
    setOpenMdc(code);
    if (!mdcDrgs[code]) {
      try {
        const drgs = await listDrgsByMdc(code);
        setMdcDrgs((prev) => ({ ...prev, [code]: drgs }));
      } catch (e) {
        setError(String(e));
      }
    }
  }

  return (
    <div className="list-pane">
      <div className="pane-header">
        <h2 className="pane-header__title">DRG Browser</h2>
        <span className="pane-header__count">{mdcs.length} MDCs · 770 DRGs</span>
      </div>

      {loading && <div className="status">Loading…</div>}
      {error && <div className="status error">{error}</div>}

      <div className="list-scroll">
        {mdcs.map((m) => {
          const isOpen = openMdc === m.code;
          const drgs = mdcDrgs[m.code] ?? [];
          return (
            <div key={m.code} className="mdc-card">
              <button
                className="mdc-card__head"
                onClick={() => expandMdc(m.code)}
              >
                <span className="mdc-code">{m.code}</span>
                <span className="mdc-name">{m.name}</span>
                <span className="mdc-count">{m.drgCount}</span>
                <span className="chev">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && m.description && (
                <p className="mdc-desc">{m.description}</p>
              )}
              {isOpen && (
                <ul className="list-inner">
                  {drgs.length === 0 && (
                    <li className="state-msg state-msg--small">Loading DRGs…</li>
                  )}
                  {drgs.map((r) => {
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
