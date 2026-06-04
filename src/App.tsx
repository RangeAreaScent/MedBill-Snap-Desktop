import { useState } from "react";
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

type Tab = "search" | "calculator" | "drg" | "favorites" | "collections" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "search", label: "Search", icon: "⌕" },
  { id: "calculator", label: "Calculator", icon: "∑" },
  { id: "drg", label: "DRG Browser", icon: "▦" },
  { id: "favorites", label: "Favorites", icon: "★" },
  { id: "collections", label: "Collections", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const LIBRARY_TABS: Tab[] = ["search", "drg", "favorites", "collections"];

export default function App() {
  return (
    <SettingsProvider>
      <AppDataProvider>
        <Shell />
      </AppDataProvider>
    </SettingsProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>("search");
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [addToCollectionFor, setAddToCollectionFor] = useState<LibraryItem | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const { createCollection, premiumPrompt, clearPremiumPrompt } = useAppData();

  function openItem(item: LibraryItem) {
    setSelected(item);
  }

  return (
    <div className="shell">
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? " tab-btn--on" : ""}`}
            onClick={() => setTab(t.id)}
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
                <div className="detail-empty">
                  <p>Select an item to see details here.</p>
                </div>
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
    </div>
  );
}
