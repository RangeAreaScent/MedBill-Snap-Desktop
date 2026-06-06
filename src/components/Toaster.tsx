import { useEffect, useState } from "react";

/** Phase A — minimal toast surface.
 *
 * Fire-and-forget messages triggered by short-lived events (⌘C copy
 * confirmation, ⌘D favorite-toggle feedback, etc.). We use a window
 * CustomEvent so any component or keyboard handler can dispatch a toast
 * without prop drilling or context plumbing.
 *
 * Use:  showToast("Copied 291")
 */
const EVENT = "snap:toast";
const DURATION_MS = 1800;

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: number | undefined;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      window.clearTimeout(hideTimer);
      setMessage(detail);
      hideTimer = window.setTimeout(() => setMessage(null), DURATION_MS);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!message) return null;
  return <div className="toaster">{message}</div>;
}
