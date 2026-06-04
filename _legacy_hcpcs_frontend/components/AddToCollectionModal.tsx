import { useState } from "react";
import { useAppData } from "../state";
import type { SearchResult } from "../types";
import { CollectionFormModal } from "./CollectionFormModal";
import { Modal } from "./Modal";

interface Props {
  item: SearchResult;
  /** Pinned modifier suffix to store alongside the code (e.g. "RR-KX"). */
  modifiers?: string;
  onClose: () => void;
}

export function AddToCollectionModal({ item, modifiers, onClose }: Props) {
  const {
    collections,
    createCollection,
    addToCollection,
    removeFromCollection,
    isInCollection,
  } = useAppData();
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <CollectionFormModal
        title="New collection"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={(name, emoji) => {
          const id = createCollection(name, emoji);
          if (id) addToCollection(id, item, modifiers);
        }}
      />
    );
  }

  const billingLine =
    modifiers && modifiers.length > 0 ? `${item.code}-${modifiers}` : item.code;

  return (
    <Modal
      title={`Add ${billingLine} to collection`}
      onClose={onClose}
      footer={
        <button className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <button className="btn btn--block" onClick={() => setCreating(true)}>
        ＋ New collection
      </button>
      {collections.length === 0 ? (
        <p className="modal-empty">No collections yet.</p>
      ) : (
        <div className="pick-list">
          {collections.map((c) => {
            const inside = isInCollection(c.id, item.code);
            return (
              <button
                key={c.id}
                className="pick-row"
                onClick={() =>
                  inside
                    ? removeFromCollection(c.id, item.code)
                    : addToCollection(c.id, item, modifiers)
                }
              >
                <span className="pick-row__emoji">{c.emoji}</span>
                <span className="pick-row__name">{c.name}</span>
                <span className="pick-row__count">{c.items.length}</span>
                <span className="pick-row__check">{inside ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
