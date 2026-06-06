import { useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { exportCollectionCSV, exportCollectionPDF } from "../export";
import { useListKeyNav } from "../hooks/useListKeyNav";
import { useAppData } from "../state";
import type { CollectionItem, LibraryItem, SearchResult } from "../types";
import { CodeRow } from "./CodeRow";
import { CollectionFormModal } from "./CollectionFormModal";

interface Props {
  selected: LibraryItem | null;
  onSelect: (item: LibraryItem) => void;
}

function itemToResult(i: CollectionItem): SearchResult {
  if (i.kind === "pos") {
    return { kind: "pos", code: i.displayCode, name: i.name, description: i.description };
  }
  if (i.kind === "modifier") {
    return {
      kind: "modifier",
      code: i.displayCode,
      name: i.name,
      description: i.description,
      category: null,
    };
  }
  return {
    kind: "drg",
    number: i.displayCode,
    name: i.name,
    mdcCode: null,
    drgType: null,
    severity: null,
    relativeWeight: null,
  };
}

export function CollectionsView({ selected, onSelect }: Props) {
  const {
    collections,
    notes,
    createCollection,
    renameCollection,
    deleteCollection,
    removeFromCollection,
    isFavorite,
    toggleFavorite,
  } = useAppData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [busyExport, setBusyExport] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const renamingCollection = renameTarget
    ? collections.find((c) => c.id === renameTarget) ?? null
    : null;

  // Phase A — ↑↓ navigation across the currently-open collection's items.
  const navItems = useMemo<LibraryItem[]>(
    () =>
      openId
        ? collections.find((c) => c.id === openId)?.items ?? []
        : [],
    [openId, collections],
  );
  useListKeyNav(navItems, selected?.key ?? null, onSelect);

  return (
    <div className="list-pane">
      <div className="pane-header">
        <h2 className="pane-header__title">Collections</h2>
        <span className="pane-header__count">{collections.length}</span>
        <button
          className="btn btn--small btn--primary"
          onClick={() => setShowNewModal(true)}
        >
          + New
        </button>
      </div>

      <div className="list-scroll">
        {collections.length === 0 && (
          <div className="state-msg">
            <p className="state-msg__title">No collections yet</p>
            <p>
              Group POS / modifier / DRG items by case, encounter, or any other
              grouping. Tap "+ New" to start.
            </p>
          </div>
        )}

        {collections.map((c) => {
          const isOpen = openId === c.id;
          return (
            <div key={c.id} className="collection-card">
              <button
                className="collection-card__head"
                onClick={() => setOpenId(isOpen ? null : c.id)}
              >
                <span className="emoji">{c.emoji}</span>
                <span className="name">{c.name}</span>
                <span className="count">{c.items.length}</span>
                <span className="chev">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <>
                  <div className="collection-card__actions">
                    <button
                      className="btn btn--small"
                      onClick={() => setRenameTarget(c.id)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn--small"
                      disabled={busyExport === c.id || c.items.length === 0}
                      onClick={async () => {
                        setBusyExport(c.id);
                        setExportError(null);
                        try {
                          await exportCollectionCSV(c, notes);
                        } catch (e) {
                          setExportError(String(e));
                        } finally {
                          setBusyExport(null);
                        }
                      }}
                    >
                      {busyExport === c.id ? "Exporting…" : "Export CSV"}
                    </button>
                    <button
                      className="btn btn--small"
                      disabled={busyExport === c.id || c.items.length === 0}
                      onClick={async () => {
                        setBusyExport(c.id);
                        setExportError(null);
                        try {
                          await exportCollectionPDF(c, notes);
                        } catch (e) {
                          setExportError(String(e));
                        } finally {
                          setBusyExport(null);
                        }
                      }}
                    >
                      {busyExport === c.id ? "Exporting…" : "Export PDF"}
                    </button>
                    <button
                      className="btn btn--small btn--danger"
                      onClick={async () => {
                        // Tauri 2 webview silently ignores window.confirm —
                        // use the dialog plugin's native ask() instead.
                        const ok = await ask(
                          `Delete collection "${c.name}"? This removes the collection but not the items inside.`,
                          { title: "Delete collection", kind: "warning" },
                        );
                        if (!ok) return;
                        deleteCollection(c.id);
                        if (openId === c.id) setOpenId(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {exportError && openId === c.id && (
                    <p className="state-msg state-msg--error state-msg--small">
                      Export failed: {exportError}
                    </p>
                  )}
                  <ul className="list-inner">
                    {c.items.length === 0 && (
                      <li className="state-msg state-msg--small">
                        Empty — add items from Search or Detail view.
                      </li>
                    )}
                    {c.items.map((i) => (
                      <li key={i.key} className="collection-item-row">
                        <CodeRow
                          result={itemToResult(i)}
                          selected={selected?.key === i.key}
                          isFavorite={isFavorite(i.key)}
                          onClick={onSelect}
                          onToggleFavorite={toggleFavorite}
                        />
                        <button
                          className="row-remove"
                          onClick={() => removeFromCollection(c.id, i.key)}
                          title="Remove from collection"
                          aria-label="Remove from collection"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>

      {showNewModal && (
        <CollectionFormModal
          title="New collection"
          submitLabel="Create"
          onSubmit={(name, emoji) => createCollection(name, emoji)}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {renamingCollection && (
        <CollectionFormModal
          title="Rename collection"
          initialName={renamingCollection.name}
          initialEmoji={renamingCollection.emoji}
          submitLabel="Save"
          onSubmit={(name, emoji) =>
            renameCollection(renamingCollection.id, name, emoji)
          }
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}
