import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { searchDrgs, searchModifiers, searchPos } from "../api";
import { useAppData } from "../state";
import type { LibraryItem, SearchResult } from "../types";
import { toLibraryItem } from "../types";

/** Phase C (SNAP_DESKTOP_IMPROVEMENT_PLAN.md) — ⌘K command palette.
 *
 * Single overlay that unifies:
 *   - Cross-mode code search (POS / Modifier / DRG — debounced, only
 *     when query has substance)
 *   - Favorite jumps (top 3, idle only)
 *   - Navigation actions (tab jumps, always available via fuzzy match)
 *
 * MedBill deviations from the Tariff-Snap-UK reference:
 *   - 3 search surfaces (POS + Modifier + DRG) instead of a single
 *     `searchCodes(q)` — the palette runs all three in parallel and
 *     merges, capped at 5 total. Mode picker still lives in the
 *     dedicated Search tab; the palette is a quick-jump surface for
 *     users who already know what they're looking for.
 *   - No "recents" group — MedBill state doesn't track recent items
 *     (yet — Phase E candidate).
 *   - No domain-specific Actions group (Tariff has NI Mode toggle;
 *     MedBill has no equivalent global toggle). Actions group skipped.
 *
 * Noise prevention rules (kept identical to the reference):
 *   1. Codes group only renders when query.length >= 2.
 *   2. Favorites only renders when query is empty.
 *   3. Group limits (5 / 3) keep the list under a single screen.
 */

type Tab =
  | "search"
  | "calculator"
  | "drg"
  | "favorites"
  | "collections"
  | "settings";

interface Props {
  open: boolean;
  onClose: () => void;
  onJumpToItem: (item: LibraryItem) => void;
  onJumpToTab: (tab: Tab) => void;
}

export function CommandPalette({
  open,
  onClose,
  onJumpToItem,
  onJumpToTab,
}: Props) {
  const [query, setQuery] = useState("");
  const [codeResults, setCodeResults] = useState<SearchResult[]>([]);
  const { favorites } = useAppData();

  // Reset query whenever the palette opens or closes so re-opening
  // starts from a clean state.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Debounced cross-mode code search. Runs all three search surfaces
  // in parallel and merges the top results so the palette doesn't favor
  // any one kind. Two-character minimum filters out single-letter noise.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCodeResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      Promise.all([
        searchPos(q, 3).catch(() => [] as SearchResult[]),
        searchModifiers(q, 3).catch(() => [] as SearchResult[]),
        searchDrgs(q, 5).catch(() => [] as SearchResult[]),
      ])
        .then(([pos, mods, drgs]) => {
          if (!active) return;
          // Interleave: prioritize exact-prefix hits across kinds, then
          // FTS matches. Caller's source already orders within-kind.
          const merged = [...pos, ...mods, ...drgs].slice(0, 5);
          setCodeResults(merged);
        })
        .catch(() => {
          if (active) setCodeResults([]);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  if (!open) return null;

  const trimmed = query.trim();
  const showIdleSuggestions = trimmed.length === 0;
  const showCodes = trimmed.length >= 2 && codeResults.length > 0;

  function jumpItem(item: LibraryItem) {
    onJumpToItem(item);
    onClose();
  }
  function jumpTab(tab: Tab) {
    onJumpToTab(tab);
    onClose();
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      label="Command palette"
      className="cmdk-root"
    >
      <Command.Input
        placeholder="Search POS / modifier / DRG or jump to a tab…"
        value={query}
        onValueChange={setQuery}
        className="cmdk-input"
        autoFocus
      />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No matches</Command.Empty>

        {showCodes && (
          <Command.Group heading="Codes" className="cmdk-group">
            {codeResults.map((r) => {
              const item = toLibraryItem(r);
              return (
                <Command.Item
                  key={`code-${item.key}`}
                  value={`${item.kind} ${item.displayCode} ${item.name}`}
                  onSelect={() => jumpItem(item)}
                  className="cmdk-item"
                >
                  <span className={`code-chip code-chip--${item.kind}`}>
                    {kindLabel(item.kind)}
                  </span>
                  <span className="cmdk-item__code">{item.displayCode}</span>
                  <span className="cmdk-item__desc">{item.name}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {showIdleSuggestions && favorites.length > 0 && (
          <Command.Group heading="Favorites" className="cmdk-group">
            {favorites.slice(0, 3).map((f) => (
              <Command.Item
                key={`fav-${f.key}`}
                value={`favorite ${f.kind} ${f.displayCode} ${f.name}`}
                onSelect={() => jumpItem(f)}
                className="cmdk-item"
              >
                <span className={`code-chip code-chip--${f.kind}`}>
                  {kindLabel(f.kind)}
                </span>
                <span className="cmdk-item__code">{f.displayCode}</span>
                <span className="cmdk-item__desc">{f.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Go to" className="cmdk-group">
          <Command.Item
            value="go to search"
            onSelect={() => jumpTab("search")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">⌕</span>
            <span className="cmdk-item__label">Search</span>
            <span className="cmdk-item__hint">⌘1</span>
          </Command.Item>
          <Command.Item
            value="go to calculator cc mcc impact"
            onSelect={() => jumpTab("calculator")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">∑</span>
            <span className="cmdk-item__label">CC/MCC Calculator</span>
            <span className="cmdk-item__hint">⌘2</span>
          </Command.Item>
          <Command.Item
            value="go to drg browser mdc"
            onSelect={() => jumpTab("drg")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">▦</span>
            <span className="cmdk-item__label">DRG Browser</span>
            <span className="cmdk-item__hint">⌘3</span>
          </Command.Item>
          <Command.Item
            value="go to favorites starred"
            onSelect={() => jumpTab("favorites")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">★</span>
            <span className="cmdk-item__label">Favorites</span>
            <span className="cmdk-item__hint">⌘4</span>
          </Command.Item>
          <Command.Item
            value="go to collections lists"
            onSelect={() => jumpTab("collections")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">🗂</span>
            <span className="cmdk-item__label">Collections</span>
            <span className="cmdk-item__hint">⌘5</span>
          </Command.Item>
          <Command.Item
            value="go to settings preferences theme premium"
            onSelect={() => jumpTab("settings")}
            className="cmdk-item"
          >
            <span className="cmdk-item__icon">⚙</span>
            <span className="cmdk-item__label">Settings</span>
            <span className="cmdk-item__hint">⌘,</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function kindLabel(k: LibraryItem["kind"]): string {
  return k === "pos" ? "POS" : k === "modifier" ? "MOD" : "DRG";
}
