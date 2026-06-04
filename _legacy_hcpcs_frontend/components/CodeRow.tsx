import type { SearchResult } from "../types";

interface Props {
  item: SearchResult;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

export function CodeRow({
  item,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: Props) {
  return (
    <div
      className={`code-row${selected ? " code-row--selected" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="code-row__main">
        <div className="code-row__top">
          <span className="code-row__code">{item.code}</span>
          {item.isBillable ? (
            <span className="badge badge--billable">Billable</span>
          ) : (
            <span className="badge badge--nonbillable">Non-billable</span>
          )}
          {item.category && (
            <span className="badge badge--category" title={item.categoryName}>
              {item.category}
            </span>
          )}
        </div>
        <div className="code-row__desc">{item.description}</div>
        {item.categoryName && (
          <div className="code-row__chapter">{item.categoryName}</div>
        )}
      </div>
      <button
        className={`star-btn${favorite ? " star-btn--on" : ""}`}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        {favorite ? "★" : "☆"}
      </button>
    </div>
  );
}
