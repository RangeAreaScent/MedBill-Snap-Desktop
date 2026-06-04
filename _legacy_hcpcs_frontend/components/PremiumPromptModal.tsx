import { Modal } from "./Modal";

interface Props {
  message: string;
  onGoSettings: () => void;
  onClose: () => void;
}

export function PremiumPromptModal({ message, onGoSettings, onClose }: Props) {
  return (
    <Modal
      title="Premium feature"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Not now
          </button>
          <button className="btn btn--primary" onClick={onGoSettings}>
            See premium
          </button>
        </>
      }
    >
      <p className="premium-box__text">{message}</p>
      <p className="premium-box__text">
        Premium is a one-time purchase — it also unlocks all four premium
        themes. Your existing favorites and collections are always kept.
      </p>
    </Modal>
  );
}
