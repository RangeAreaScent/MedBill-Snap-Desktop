import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { useListKeyNav } from "../hooks/useListKeyNav";
import { useAppData } from "../state";
import type { Favorite, LibraryItem, SearchResult } from "../types";
import { CodeRow } from "./CodeRow";
import { showToast } from "./Toaster";

interface Props {
  selected: LibraryItem | null;
  onSelect: (item: LibraryItem) => void;
}

/** Polish — multi-select bulk actions for Favorites.
 *
 * Tariff reference pattern: a `selecting` toggle in the pane header
 * swaps each row into a checkbox row + reveals an icon action bar
 * (📁 add-to-collection / 📄 export-PDF / 🗑 remove / ✕ cancel).
 * ↑↓ navigation auto-disables while selecting so row clicks toggle
 * the checkbox instead of the selection.
 *
 * MedBill adaptation: keyed by LibraryItem.key (kind-namespaced), bulk
 * PDF goes through the same `export_pdf` Tauri command but builds
 * entries from the Favorite shape directly (no re-fetch — the user
 * already saw enough detail to favorite, and bulk exports prioritize
 * responsiveness over freshness).
 */

const KIND_LABEL: Record<LibraryItem["kind"], string> = {
  pos: "POS",
  modifier: "MOD",
  drg: "DRG",
};

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
  const { favorites, isFavorite, toggleFavorite, removeFavorite, notes } =
    useAppData();

  // Polish — multi-select state.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [movingToCollection, setMovingToCollection] = useState(false);

  // ↑↓ nav only works when NOT selecting (rows act as checkboxes instead).
  useListKeyNav(
    selecting ? [] : favorites,
    selected?.key ?? null,
    onSelect,
  );

  // Drop select-mode automatically when the list empties.
  useEffect(() => {
    if (favorites.length === 0 && selecting) {
      setSelecting(false);
      setPicked(new Set());
    }
  }, [favorites.length, selecting]);

  function togglePick(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function cancelSelect() {
    setSelecting(false);
    setPicked(new Set());
  }

  function pickedFavorites(): Favorite[] {
    return favorites.filter((f) => picked.has(f.key));
  }

  async function bulkRemove() {
    if (picked.size === 0) return;
    const n = picked.size;
    const ok = await ask(
      `Remove ${n} favorite${n === 1 ? "" : "s"}? This cannot be undone.`,
      { title: "Remove favorites", kind: "warning" },
    );
    if (!ok) return;
    picked.forEach((k) => removeFavorite(k));
    cancelSelect();
    showToast(`Removed ${n} favorite${n === 1 ? "" : "s"}`);
  }

  async function bulkExport() {
    const items = pickedFavorites();
    if (items.length === 0) return;
    const path = await save({
      defaultPath: `favorites-${items.length}-items.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return;
    try {
      await invoke("export_pdf", {
        path,
        title: `Favorites (${items.length} item${items.length === 1 ? "" : "s"})`,
        entries: items.map((f) => ({
          kind: KIND_LABEL[f.kind],
          code: f.displayCode,
          name: f.name,
          description: f.description,
          note: notes[f.key]?.text ?? "",
          // Bulk exports skip the per-kind detail re-fetch — keeps the
          // operation responsive. Users who want full details should
          // export from a Collection (which uses export.ts buildEntries).
          details: "",
        })),
      });
      showToast(`PDF saved · ${items.length} item${items.length === 1 ? "" : "s"}`);
      cancelSelect();
    } catch (e) {
      showToast(`Export failed: ${e}`);
    }
  }

  return (
    <div className="list-pane">
      <div className="pane-header">
        <h2 className="pane-header__title">Favorites</h2>
        <span className="pane-header__count">{favorites.length}</span>
        {favorites.length > 0 && !selecting && (
          <button
            className="btn btn--small"
            onClick={() => setSelecting(true)}
            title="Select multiple items for bulk actions"
          >
            Select
          </button>
        )}
      </div>

      {selecting && (
        <div className="multi-bar">
          <span className="multi-bar__count">
            {picked.size} selected
          </span>
          <div className="multi-bar__actions">
            <button
              className="icon-btn"
              onClick={() => setMovingToCollection(true)}
              disabled={picked.size === 0}
              title="Add to a collection"
            >
              📁
            </button>
            <button
              className="icon-btn"
              onClick={bulkExport}
              disabled={picked.size === 0}
              title="Export as PDF"
            >
              📄
            </button>
            <button
              className="icon-btn icon-btn--danger"
              onClick={bulkRemove}
              disabled={picked.size === 0}
              title="Remove from favorites"
            >
              🗑
            </button>
            <button
              className="icon-btn"
              onClick={cancelSelect}
              title="Cancel"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {movingToCollection && picked.size > 0 && (
        <BulkAddToCollection
          items={pickedFavorites()}
          onClose={() => setMovingToCollection(false)}
          onAdded={() => {
            setMovingToCollection(false);
            cancelSelect();
          }}
        />
      )}

      <ul className="list-scroll">
        {favorites.length === 0 && (
          <li className="state-msg">
            <p className="state-msg__title">No favorites yet</p>
            <p>Tap the ☆ on any POS, modifier, or DRG to save it here.</p>
          </li>
        )}
        {favorites.map((f) => {
          if (selecting) {
            const isPicked = picked.has(f.key);
            return (
              <label
                key={f.key}
                className={`code-row code-row--pickable${
                  isPicked ? " code-row--picked" : ""
                }`}
                data-key={f.key}
              >
                <input
                  type="checkbox"
                  className="code-row__check"
                  checked={isPicked}
                  onChange={() => togglePick(f.key)}
                />
                <span className={`code-chip code-chip--${f.kind}`}>
                  {KIND_LABEL[f.kind]}
                </span>
                <span className="code-row__code">{f.displayCode}</span>
                <span className="code-row__main">
                  <span className="code-row__name">{f.name}</span>
                </span>
              </label>
            );
          }
          return (
            <CodeRow
              key={f.key}
              result={favoriteToResult(f)}
              selected={selected?.key === f.key}
              isFavorite={isFavorite(f.key)}
              onClick={onSelect}
              onToggleFavorite={toggleFavorite}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** Bulk "add to collection" picker — opens when the user clicks 📁
 * with N favorites picked. One target collection receives them all. */
function BulkAddToCollection({
  items,
  onClose,
  onAdded,
}: {
  items: Favorite[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { collections, addToCollection } = useAppData();

  function send(collectionId: string, name: string) {
    items.forEach((f) => {
      // addToCollection takes a LibraryItem; Favorite extends LibraryItem
      // with addedAt — direct pass works.
      addToCollection(collectionId, {
        key: f.key,
        kind: f.kind,
        displayCode: f.displayCode,
        name: f.name,
        description: f.description,
      });
    });
    showToast(`Added ${items.length} to ${name}`);
    onAdded();
  }

  if (collections.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h3 className="modal__title">No collections yet</h3>
            <button className="modal__close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal__body">
            <p className="settings-disclaimer">
              Create a collection from the Collections tab first, then come
              back to bulk-add favorites.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">
            Add {items.length} to a collection
          </h3>
          <button className="modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal__body">
          <div className="bulk-collection-list">
            {collections.map((c) => (
              <button
                key={c.id}
                className="bulk-collection-row"
                onClick={() => send(c.id, c.name)}
              >
                <span className="bulk-collection-row__emoji">{c.emoji}</span>
                <span className="bulk-collection-row__name">{c.name}</span>
                <span className="bulk-collection-row__count">
                  {c.items.length} items
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
