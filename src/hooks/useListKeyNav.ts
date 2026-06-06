import { useEffect } from "react";

/** Phase A (SNAP_DESKTOP_IMPROVEMENT_PLAN.md §11.1) — list keyboard navigation.
 *
 * Wires ↑↓Enter to a result list so the user can drive the app without a
 * mouse. Selection lives in the parent (selectedKey + onSelect) so the
 * detail pane re-renders for free.
 *
 * MedBill adaptation: the reference (Tariff Snap UK) keys items by a
 * single `code` string. MedBill items are kind-namespaced — POS, modifier,
 * and DRG share a result surface but live in different tables, so we use
 * `LibraryItem.key` ("pos:11" / "mod:LT" / "drg:291") as the identifier
 * and pass the full item to `onSelect` so the parent can route to the
 * correct kind without a key-prefix re-parse.
 *
 * Behaviour:
 *  - When a text input/textarea is focused, ↓ jumps to the first row and
 *    blurs the input so subsequent arrows keep navigating the list.
 *    Other keys are passed through (typing into search still works).
 *  - Once on the list, ↑↓ moves selection. Wrapping is intentionally off
 *    so the top/bottom acts as a natural stop (1Password / Mail convention).
 *  - When `selectedKey` changes, the matching row is scrolled into view
 *    (the row carries `data-key={key}`).
 *  - `Enter` is a no-op here — clicking/selecting a row already calls
 *    `onSelect`, and the detail pane shows whatever's selected.
 *  - Phase C guard: if the ⌘K command palette is open (`[cmdk-root]`
 *    selector hits), defer to cmdk's own handling so background navigation
 *    doesn't blur the palette input.
 */
export function useListKeyNav<T extends { key: string }>(
  items: T[],
  selectedKey: string | null,
  onSelect: (item: T) => void,
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't fight modifier-key shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (items.length === 0) return;

      // Phase C: yield to cmdk when the command palette is open.
      if (document.querySelector("[cmdk-root]")) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditable = tag === "input" || tag === "textarea";

      if (e.key === "ArrowDown") {
        if (inEditable) {
          // ↓ from search input jumps to first row.
          e.preventDefault();
          target?.blur();
          onSelect(items[0]);
          return;
        }
        e.preventDefault();
        const idx = items.findIndex((i) => i.key === selectedKey);
        const next = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
        onSelect(items[next]);
      } else if (e.key === "ArrowUp") {
        if (inEditable) return;
        e.preventDefault();
        const idx = items.findIndex((i) => i.key === selectedKey);
        const next = idx <= 0 ? 0 : idx - 1;
        onSelect(items[next]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedKey, onSelect]);

  // Scroll the selected row into view whenever it changes.
  useEffect(() => {
    if (!selectedKey) return;
    const el = document.querySelector(
      `[data-key="${CSS.escape(selectedKey)}"]`,
    );
    if (el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [selectedKey]);
}
