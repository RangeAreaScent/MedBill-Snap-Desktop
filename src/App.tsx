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
import { PremiumPromptModal } from "./components/PremiumPromptModal";
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
  const {
    createCollection,
    premiumPrompt,
    clearPremiumPrompt,
    isFavorite,
    toggleFavorite,
    removeFavorite,
  } = useAppData();

  const openItem = useCallback((item: LibraryItem) => {
    setSelected(item);
  }, []);

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
    on("file.command_palette", () => {
      // Phase C — will toggle the palette once cmdk lands.
      // For now, just bring focus to the search bar as the closest equivalent.
      showToast("Command palette — landing in Phase C");
    });
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

  // Esc priority — close palette > narrow detail > return focus to search input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
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
  }, [tab]);

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

      <main className={`main-area main-area--${tab}`}>
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
            <div className="right-pane">
              {selected ? (
                <CodeDetailView
                  item={selected}
                  onAddToCollection={() => setAddToCollectionFor(selected)}
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
        <li><kbd>{mod}F</kbd> Focus search</li>
        <li><kbd>{mod}1</kbd>–<kbd>{mod}5</kbd> Jump between tabs</li>
        <li><kbd>{mod}C</kbd> Copy selected code</li>
        <li><kbd>{mod}D</kbd> Toggle favorite</li>
        <li><kbd>{mod}{isMac ? "," : "/"}</kbd> Settings</li>
      </ul>
    </div>
  );
}
