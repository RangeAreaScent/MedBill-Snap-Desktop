import { useState } from "react";
import { Modal } from "./Modal";

const EMOJI_CHOICES = [
  "📁", "⭐", "🩺", "💊", "🦽", "♿", "🦿", "🩼",
  "🩹", "💉", "🩸", "📋", "🏥", "🚑", "🧪", "🫁",
];

interface Props {
  title: string;
  initialName?: string;
  initialEmoji?: string;
  submitLabel: string;
  onSubmit: (name: string, emoji: string) => void;
  onClose: () => void;
}

export function CollectionFormModal({
  title,
  initialName = "",
  initialEmoji = "📁",
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);

  const trimmed = name.trim();

  function submit() {
    if (!trimmed) return;
    onSubmit(trimmed, emoji);
    onClose();
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={!trimmed}
          >
            {submitLabel}
          </button>
        </>
      }
    >
      <label className="field-label">Name</label>
      <input
        className="text-input"
        value={name}
        autoFocus
        placeholder="Collection name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <label className="field-label">Icon</label>
      <div className="emoji-grid">
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            className={`emoji-cell${e === emoji ? " emoji-cell--on" : ""}`}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </Modal>
  );
}
