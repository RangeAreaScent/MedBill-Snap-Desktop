import { useState } from "react";
import { useAppData } from "../state";
import type { LibraryItem } from "../types";
import { Modal } from "./Modal";

interface Props {
  item: LibraryItem;
  onClose: () => void;
  onCreateNew: () => void;
}

export function AddToCollectionModal({ item, onClose, onCreateNew }: Props) {
  const { collections, addToCollection, isInCollection } = useAppData();
  const [touched, setTouched] = useState<Set<string>>(new Set());

  if (collections.length === 0) {
    return (
      <Modal
        title="Add to collection"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                onClose();
                onCreateNew();
              }}
            >
              Create collection
            </button>
          </>
        }
      >
        <p>You don't have any collections yet. Create one to start grouping items.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Add ${item.kind.toUpperCase()} ${item.displayCode} to…`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              onClose();
              onCreateNew();
            }}
          >
            + New collection
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <ul className="collection-pick-list">
        {collections.map((c) => {
          const already = isInCollection(c.id, item.key) || touched.has(c.id);
          return (
            <li key={c.id}>
              <button
                className={`collection-pick${already ? " collection-pick--on" : ""}`}
                disabled={already}
                onClick={() => {
                  addToCollection(c.id, item);
                  setTouched((prev) => new Set(prev).add(c.id));
                }}
              >
                <span className="emoji">{c.emoji}</span>
                <span className="name">{c.name}</span>
                <span className="count">{c.items.length}</span>
                {already && <span className="status">✓ added</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
