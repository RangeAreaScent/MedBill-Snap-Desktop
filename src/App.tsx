import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";
import { AppDataProvider, useAppData } from "./state";
import { SettingsProvider } from "./settings";
import type { LibraryItem } from "./types";
import { SearchView } from "./components/SearchView";
import { FavoritesView } from "./components/FavoritesView";
import { CollectionsView } from "./components/CollectionsView";
import { CodeDetailView } from "./components/CodeDetailView";
import { CCMCCCalculatorView } from "./components/CCMCCCalculatorView";
import { DRGBrowserView } from "./components/DRGBrowserView";
import { SettingsView } from "./components/SettingsView";
import { AddToCollectionModal } from "./components/AddToCollectionModal";
import { CollectionFormModal } from "./components/CollectionFormModal";
import { CommandPalette } from "./components/CommandPalette";
import { PremiumPromptModal } from "./components/PremiumPromptModal";
import { Splitter } from "./components/Splitter";
import { StatusBar } from "./components/StatusBar";
import { showToast, Toaster } from "./components/Toaster";

type Tab =
  | "search"
  | "calculator"
  | "drg"
  | "favorites"
  | "collections"
  | "settings";

const TABS: { id: Tab; label: string; icon: string; shortcut?: string }[] = [
  { id: "search", label: "Search", icon: "⌕", shortcut: "1" },
  { id: "calculator", label: "Calculator", icon: "∑", shortcut: "2" },
  { id: "drg", label: "DRG Browser", icon: "▦", shortcut: "3" },
  { id: "favorites", label: "Favorites", icon: "★", shortcut: "4" },
  { id: "collections", label: "Collections", icon: "🗂", shortcut: "5" },
  { id: "settings", label: "Settings", icon: "⚙", shortcut: "," },
];

const LIBRARY_TABS: Tab[] = ["search", "drg", "favorites", "collections"];

/** Phase B: responsive breakpoint. Below this, the list-pane goes
 *  full-width and the detail-pane overlays it. 900px lets standard
 *  13-inch laptops keep the split; only intentional narrow windows
 *  trip the overlay. */
const NARROW_PX = 900;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < NARROW_PX,
  );
  useEffect(() => {
    function onResize() {
      setNarrow(window.innerWidth < NARROW_PX);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

export default function App() {
  return (
    <SettingsProvider>
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    </SettingsProvider>
  );
}

function AppShell() {
  const [tab, setTab] = useState<Tab>("search");
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [addToCollectionFor, setAddToCollectionFor] = useState<LibraryItem | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isNarrow = useIsNarrow();
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false);
  const {
    createCollection,
    premiumPrompt,
    clearPremiumPrompt,
    isFavorite,
    toggleFavorite,
    removeFavorite,
  } = useAppData();

  // Phase B narrow-window: row selection opens the detail overlay; Esc /
  // tab change closes it.
  const openItem = useCallback((item: LibraryItem) => {
    setSelected(item);
    setNarrowDetailOpen(true);
  }, []);

  // Close the narrow overlay whenever the user changes tabs.
  useEffect(() => {
    setNarrowDetailOpen(false);
  }, [tab]);

  // Phase A — global desktop shortcuts (SNAP_DESKTOP_IMPROVEMENT_PLAN §5).
  // Single source of truth so behavior is consistent across views and the
  // native menu (Phase D) can reuse the same actions.
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditable = tag === "input" || tag === "textarea";
      const key = e.key.toLowerCase();

      // ⌘K → command palette toggle (Phase C)
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // ⌘F → focus search input
      if (key === "f") {
        e.preventDefault();
        setTab("search");
        setTimeout(() => {
          const input = document.querySelector(
            ".search-bar__input",
          ) as HTMLInputElement | null;
          input?.focus();
        }, 0);
        return;
      }
      // ⌘1~5 → sidebar tab jump (matches the TABS table order)
      if (e.key === "1") { e.preventDefault(); setTab("search"); return; }
      if (e.key === "2") { e.preventDefault(); setTab("calculator"); return; }
      if (e.key === "3") { e.preventDefault(); setTab("drg"); return; }
      if (e.key === "4") { e.preventDefault(); setTab("favorites"); return; }
      if (e.key === "5") { e.preventDefault(); setTab("collections"); return; }
      // ⌘, → Settings (macOS convention)
      if (e.key === ",") { e.preventDefault(); setTab("settings"); return; }

      // The rest need a selected item; let the browser's native ⌘C / ⌘D
      // through when the user is typing into an input.
      if (inEditable) return;
      if (!selected) return;

      // ⌘C → copy selected display code to clipboard
      if (key === "c") {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(selected.displayCode);
          showToast(`Copied ${selected.displayCode}`);
        } catch {
          showToast("Copy failed");
        }
        return;
      }
      // ⌘D → favorite toggle. MedBill's `LibraryItem` already carries
      // everything needed (key/kind/displayCode/name/description), so —
      // unlike the Tariff reference — no async detail fetch is needed.
      if (key === "d") {
        e.preventDefault();
        if (isFavorite(selected.key)) {
          removeFavorite(selected.key);
          showToast("Removed from favorites");
        } else {
          toggleFavorite(selected);
          showToast("Added to favorites");
        }
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, isFavorite, toggleFavorite, removeFavorite]);

  // Phase D — wire native menu events to the same handlers the keyboard
  // shortcuts use. Menu IDs are defined in src-tauri/src/menu.rs and
  // must match exactly (hard-coded contract).
  useEffect(() => {
    const unlistens: Array<Promise<() => void>> = [];

    function on(id: string, fn: () => void) {
      unlistens.push(listen(`menu:${id}`, fn));
    }

    on("file.new_search", () => {
      setTab("search");
      setTimeout(() => {
        const input = document.querySelector(
          ".search-bar__input",
        ) as HTMLInputElement | null;
        input?.focus();
      }, 0);
    });
    on("file.command_palette", () => setPaletteOpen(true));
    on("file.export_collection", () => {
      // Re-dispatch the keyboard event CollectionsView listens for. Goes
      // through the same ⌘E path the keyboard contract uses.
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "e", metaKey: true }),
      );
    });

    on("edit.copy_code", () => {
      if (!selected) return;
      navigator.clipboard
        .writeText(selected.displayCode)
        .then(() => showToast(`Copied ${selected.displayCode}`))
        .catch(() => showToast("Copy failed"));
    });
    on("edit.find", () => {
      setTab("search");
      setTimeout(() => {
        const input = document.querySelector(
          ".search-bar__input",
        ) as HTMLInputElement | null;
        input?.focus();
      }, 0);
    });

    on("view.tab_search", () => setTab("search"));
    on("view.tab_calculator", () => setTab("calculator"));
    on("view.tab_drg", () => setTab("drg"));
    on("view.tab_favorites", () => setTab("favorites"));
    on("view.tab_collections", () => setTab("collections"));
    on("view.tab_settings", () => setTab("settings"));
    on("view.reset_splitter", () => {
      // Phase B — splitter lands next; this just clears the persisted
      // width and notifies via toast so the menu item is non-no-op today.
      localStorage.removeItem("snap.listWidth");
      document.documentElement.style.setProperty("--list-width", "42%");
      showToast("Splitter width reset");
    });

    on("help.how_to_use", () => setTab("settings"));
    on("help.database_details", () => setTab("settings"));

    return () => {
      unlistens.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, [selected]);

  // Esc priority:
  //   1. defer to cmdk if palette is open
  //   2. close narrow-window detail overlay if it's up
  //   3. return focus to the search input on the Search tab
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Phase C — cmdk handles its own Esc; don't fight it.
      if (paletteOpen) return;
      // Phase B — close narrow-window detail overlay if it's up.
      if (isNarrow && narrowDetailOpen) {
        setNarrowDetailOpen(false);
        return;
      }
      if (tab === "search") {
        const active = document.activeElement as HTMLElement | null;
        const t = active?.tagName?.toLowerCase();
        if (t === "input" || t === "textarea") return;
        const input = document.querySelector(
          ".search-bar__input",
        ) as HTMLInputElement | null;
        input?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, paletteOpen, isNarrow, narrowDetailOpen]);

  return (
    <div className="app">
      <div className="app__main">
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? " tab-btn--on" : ""}`}
            onClick={() => setTab(t.id)}
            title={t.shortcut ? `${t.label}  ⌘${t.shortcut}` : t.label}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main
        className={`main-area main-area--${tab}${
          isNarrow ? " main-area--narrow" : ""
        }${isNarrow && narrowDetailOpen ? " main-area--detail-overlay" : ""}`}
      >
        {LIBRARY_TABS.includes(tab) && (
          <>
            <div className="left-pane">
              {tab === "search" && (
                <SearchView selected={selected} onSelect={openItem} />
              )}
              {tab === "drg" && (
                <DRGBrowserView selected={selected} onSelect={openItem} />
              )}
              {tab === "favorites" && (
                <FavoritesView selected={selected} onSelect={openItem} />
              )}
              {tab === "collections" && (
                <CollectionsView selected={selected} onSelect={openItem} />
              )}
            </div>
            {!isNarrow && <Splitter />}
            <div className="right-pane">
              {selected ? (
                <CodeDetailView
                  item={selected}
                  onAddToCollection={() => setAddToCollectionFor(selected)}
                  onClose={
                    isNarrow ? () => setNarrowDetailOpen(false) : undefined
                  }
                />
              ) : (
                <EmptyDetail />
              )}
            </div>
          </>
        )}
        {tab === "calculator" && (
          <CCMCCCalculatorView
            onOpenDrg={(item) => {
              setSelected(item);
              setTab("search");
            }}
          />
        )}
        {tab === "settings" && <SettingsView />}
      </main>

      {addToCollectionFor && (
        <AddToCollectionModal
          item={addToCollectionFor}
          onClose={() => setAddToCollectionFor(null)}
          onCreateNew={() => setShowNewCollection(true)}
        />
      )}

      {showNewCollection && (
        <CollectionFormModal
          title="New collection"
          submitLabel="Create"
          onSubmit={(name, emoji) => createCollection(name, emoji)}
          onClose={() => setShowNewCollection(false)}
        />
      )}

      {premiumPrompt && (
        <PremiumPromptModal
          message={premiumPrompt}
          onClose={clearPremiumPrompt}
          onGoSettings={() => {
            clearPremiumPrompt();
            setTab("settings");
          }}
        />
      )}

      </div>{/* /.app__main */}
      <StatusBar />
      <Toaster />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onJumpToItem={(item) => {
          setTab("search");
          setSelected(item);
        }}
        onJumpToTab={(t) => setTab(t)}
      />
    </div>
  );
}

/** Phase A — empty-detail panel with discoverable shortcut hints.
 * Mirrors the Tariff reference's EmptyDetail pattern. Phase C (⌘K) and
 * Phase D (menu) will add additional rows. */
function EmptyDetail() {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";
  return (
    <div className="detail-empty">
      <p className="detail-empty__title">Select an item to see details</p>
      <ul className="detail-empty__hints">
        <li><kbd>↑</kbd> <kbd>↓</kbd> Navigate rows</li>
        <li><kbd>{mod}K</kbd> Command palette</li>
        <li><kbd>{mod}F</kbd> Focus search</li>
        <li><kbd>{mod}1</kbd>–<kbd>{mod}5</kbd> Jump between tabs</li>
        <li><kbd>{mod}C</kbd> Copy selected code</li>
        <li><kbd>{mod}D</kbd> Toggle favorite</li>
        <li><kbd>{mod}{isMac ? "," : "/"}</kbd> Settings</li>
      </ul>
    </div>
  );
}
