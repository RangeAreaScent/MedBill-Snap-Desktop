import { useListKeyNav } from "../hooks/useListKeyNav";
import { useAppData } from "../state";
import type { Favorite, LibraryItem, SearchResult } from "../types";
import { CodeRow } from "./CodeRow";

interface Props {
  selected: LibraryItem | null;
  onSelect: (item: LibraryItem) => void;
}

/** Reconstitutes a SearchResult shape from a stored Favorite for re-rendering. */
function favoriteToResult(f: Favorite): SearchResult {
  if (f.kind === "pos") {
    return { kind: "pos", code: f.displayCode, name: f.name, description: f.description };
  }
  if (f.kind === "modifier") {
    return {
      kind: "modifier",
      code: f.displayCode,
      name: f.name,
      description: f.description,
      category: null,
    };
  }
  return {
    kind: "drg",
    number: f.displayCode,
    name: f.name,
    mdcCode: null,
    drgType: null,
    severity: null,
    relativeWeight: null,
  };
}

export function FavoritesView({ selected, onSelect }: Props) {
  const { favorites, isFavorite, toggleFavorite } = useAppData();

  // Phase A — ↑↓ nav. Favorite already has `key` so it satisfies the
  // hook's generic constraint directly.
  useListKeyNav(favorites, selected?.key ?? null, onSelect);

  return (
    <div className="list-pane">
      <div className="pane-header">
        <h2 className="pane-header__title">Favorites</h2>
        <span className="pane-header__count">{favorites.length}</span>
      </div>
      <ul className="list-scroll">
        {favorites.length === 0 && (
          <li className="state-msg">
            <p className="state-msg__title">No favorites yet</p>
            <p>Tap the ☆ on any POS, modifier, or DRG to save it here.</p>
          </li>
        )}
        {favorites.map((f) => (
          <CodeRow
            key={f.key}
            result={favoriteToResult(f)}
            selected={selected?.key === f.key}
            isFavorite={isFavorite(f.key)}
            onClick={onSelect}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </ul>
    </div>
  );
}
