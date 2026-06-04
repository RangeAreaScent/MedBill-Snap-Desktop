import { useAppData } from "../state";
import type { SearchResult } from "../types";
import { CodeRow } from "./CodeRow";

interface Props {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function FavoritesView({ selectedCode, onSelect }: Props) {
  const { favorites, isFavorite, toggleFavorite } = useAppData();

  return (
    <div className="list-pane">
      <div className="pane-header">
        <h2 className="pane-header__title">Favorites</h2>
        <span className="pane-header__count">{favorites.length}</span>
      </div>
      <div className="list-scroll">
        {favorites.length === 0 && (
          <div className="state-msg">
            <p className="state-msg__title">No favorites yet</p>
            <p>Tap the ☆ on any code to save it here.</p>
          </div>
        )}
        {favorites.map((fav) => {
          const item: SearchResult = {
            code: fav.code,
            shortDescription: "",
            description: fav.description,
            isBillable: fav.isBillable,
            category: fav.category,
            categoryName: fav.categoryName,
            coverageLabel: null,
          };
          return (
            <CodeRow
              key={fav.code}
              item={item}
              selected={fav.code === selectedCode}
              favorite={isFavorite(fav.code)}
              onSelect={() => onSelect(fav.code)}
              onToggleFavorite={() => toggleFavorite(item)}
            />
          );
        })}
      </div>
    </div>
  );
}
