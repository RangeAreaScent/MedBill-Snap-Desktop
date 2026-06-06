/** Phase D (SNAP_DESKTOP_IMPROVEMENT_PLAN.md) — bottom status bar.
 *
 * Single fixed-height strip at the bottom of the window. Left: dataset
 * metadata so the user always knows what bundle they're querying. Right:
 * a quiet hint that ⌘K opens the command palette.
 *
 * Styles use CSS variables (var(--pane-2), var(--text-faint), …) so the
 * status bar follows whichever of the 7 themes is active — no per-theme
 * branching needed.
 *
 * Stats are hard-coded for v1 — bundled `medbill_v1.sqlite` is refreshed
 * semi-annually (CMS FY Oct 1 + Apr 1 cadence per HANDOFF). When the
 * bundle gets a meta-table snapshot column, replace with a single Tauri
 * command read at mount.
 */
export function StatusBar() {
  return (
    <div className="status-bar" aria-label="Status">
      <div className="status-bar__left">
        <span className="status-bar__dot" aria-hidden />
        <span className="status-bar__text">
          770 MS-DRGs · 18,432 CC/MCC · 213,321 ICD→DRG · CMS FY 2026
        </span>
      </div>
      <div className="status-bar__right">
        <span className="status-bar__hint">
          Press <kbd className="status-bar__kbd">⌘K</kbd> for commands
        </span>
      </div>
    </div>
  );
}
