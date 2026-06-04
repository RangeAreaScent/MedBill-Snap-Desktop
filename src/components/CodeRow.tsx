import type { LibraryItem, SearchResult } from "../types";
import { toLibraryItem } from "../types";

interface Props {
  result: SearchResult;
  selected?: boolean;
  isFavorite?: boolean;
  onClick?: (item: LibraryItem) => void;
  onToggleFavorite?: (item: LibraryItem) => void;
}

const KIND_LABEL: Record<LibraryItem["kind"], string> = {
  pos: "POS",
  modifier: "MOD",
  drg: "DRG",
};

export function CodeRow({
  result,
  selected,
  isFavorite,
  onClick,
  onToggleFavorite,
}: Props) {
  const item = toLibraryItem(result);
  const meta = describeMeta(result);

  return (
    <li
      className={`code-row code-row--${item.kind}${selected ? " code-row--selected" : ""}`}
      onClick={() => onClick?.(item)}
    >
      <span className={`code-chip code-chip--${item.kind}`}>
        {KIND_LABEL[item.kind]}
      </span>
      <span className="code-row__code">{item.displayCode}</span>
      <span className="code-row__main">
        <span className="code-row__name">{item.name}</span>
        {meta && <span className="code-row__meta">{meta}</span>}
      </span>
      {onToggleFavorite && (
        <button
          className={`star-btn${isFavorite ? " star-btn--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item);
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      )}
    </li>
  );
}

function describeMeta(r: SearchResult): string | null {
  if (r.kind === "drg") {
    const parts: string[] = [];
    if (r.severity) parts.push(r.severity);
    if (r.mdcCode) parts.push(`MDC ${r.mdcCode}`);
    if (r.relativeWeight != null) parts.push(`Wt ${r.relativeWeight.toFixed(4)}`);
    return parts.length ? parts.join(" · ") : null;
  }
  if (r.kind === "modifier" && r.category) {
    return r.category;
  }
  return null;
}
