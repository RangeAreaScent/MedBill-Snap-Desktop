import { useEffect, useState } from "react";
import "./styles.css";
import { CodeDetailView } from "./components/CodeDetailView";
import { CollectionsView } from "./components/CollectionsView";
import { FavoritesView } from "./components/FavoritesView";
import { ModifiersView } from "./components/ModifiersView";
import { PremiumPromptModal } from "./components/PremiumPromptModal";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { AppDataProvider, useAppData } from "./state";
import { SettingsProvider } from "./settings";

type Tab = "search" | "favorites" | "modifiers" | "collections" | "settings";

function App() {
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
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const { premiumPrompt, clearPremiumPrompt } = useAppData();

  // ⌘F / Ctrl+F jumps to the Search tab.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setTab("search");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <nav className="rail">
        <div className="rail__brand">HCPCS</div>
        <RailTab
          label="Search"
          icon="⌕"
          active={tab === "search"}
          onClick={() => setTab("search")}
        />
        <RailTab
          label="Favorites"
          icon="★"
          active={tab === "favorites"}
          onClick={() => setTab("favorites")}
        />
        <RailTab
          label="Modifiers"
          icon="⌗"
          active={tab === "modifiers"}
          onClick={() => setTab("modifiers")}
        />
        <RailTab
          label="Collections"
          icon="🗂"
          active={tab === "collections"}
          onClick={() => setTab("collections")}
        />
        <div className="rail__spacer" />
        <RailTab
          label="Settings"
          icon="⚙"
          active={tab === "settings"}
          onClick={() => setTab("settings")}
        />
      </nav>

      <main className="content">
        {tab === "search" && (
          <SearchView selectedCode={selectedCode} onSelect={setSelectedCode} />
        )}
        {tab === "favorites" && (
          <FavoritesView
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
          />
        )}
        {tab === "modifiers" && <ModifiersView />}
        {tab === "collections" && (
          <CollectionsView
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
          />
        )}
        {tab === "settings" ? (
          <SettingsView />
        ) : tab === "modifiers" ? null : (
          <CodeDetailView code={selectedCode} />
        )}
      </main>

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

function RailTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rail__tab${active ? " rail__tab--active" : ""}`}
      onClick={onClick}
      title={label}
    >
      <span className="rail__icon">{icon}</span>
      <span className="rail__label">{label}</span>
    </button>
  );
}

export default App;
