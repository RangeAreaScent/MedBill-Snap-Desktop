import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { storeRead, storeWrite } from "./api";
import { useSettings } from "./settings";
import type {
  Collection,
  CollectionItem,
  Favorite,
  NoteMap,
  SearchResult,
} from "./types";

/** Free-tier capacity. Premium unlocks unlimited. */
export const FREE_FAVORITES_MAX = 15;
export const FREE_COLLECTIONS_MAX = 10;

/** Loads a JSON document once, then persists every change atomically. */
function usePersistentState<T>(
  name: string,
  initial: T,
): [T, (updater: (prev: T) => T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    storeRead<T>(name)
      .then((data) => {
        if (data != null) setValue(data);
      })
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, [name]);

  useEffect(() => {
    if (!loaded.current) return;
    storeWrite(name, value).catch((e) =>
      console.error(`failed to persist ${name}:`, e),
    );
  }, [name, value]);

  const update = useCallback((updater: (prev: T) => T) => {
    setValue((prev) => updater(prev));
  }, []);

  return [value, update, ready];
}

function toItem(item: SearchResult, modifiers?: string): CollectionItem {
  return {
    code: item.code,
    description: item.description,
    isBillable: item.isBillable,
    category: item.category,
    categoryName: item.categoryName,
    modifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
    addedAt: Date.now(),
  };
}

interface AppData {
  ready: boolean;

  favorites: Favorite[];
  isFavorite: (code: string) => boolean;
  toggleFavorite: (item: SearchResult) => void;
  removeFavorite: (code: string) => void;

  collections: Collection[];
  createCollection: (name: string, emoji: string) => string | null;
  renameCollection: (id: string, name: string, emoji: string) => void;
  deleteCollection: (id: string) => void;
  /** Add a code (optionally with a pinned modifier suffix like "RR-KX"). */
  addToCollection: (id: string, item: SearchResult, modifiers?: string) => void;
  removeFromCollection: (id: string, code: string) => void;
  isInCollection: (id: string, code: string) => boolean;

  notes: NoteMap;
  setNote: (code: string, text: string) => void;
  deleteNote: (code: string) => void;

  /** Effective caps — Infinity when premium is unlocked. */
  favoritesMax: number;
  collectionsMax: number;
  /** A pending "this needs premium" message, or null. */
  premiumPrompt: string | null;
  promptPremium: (message: string) => void;
  clearPremiumPrompt: () => void;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { unlocked } = useSettings();
  const [favorites, updateFavorites, favReady] = usePersistentState<Favorite[]>(
    "favorites",
    [],
  );
  const [collections, updateCollections, colReady] = usePersistentState<
    Collection[]
  >("collections", []);
  const [notes, updateNotes, notesReady] = usePersistentState<NoteMap>(
    "notes",
    {},
  );
  const [premiumPrompt, setPremiumPrompt] = useState<string | null>(null);

  const favoritesMax = unlocked ? Infinity : FREE_FAVORITES_MAX;
  const collectionsMax = unlocked ? Infinity : FREE_COLLECTIONS_MAX;

  const promptPremium = useCallback((message: string) => {
    setPremiumPrompt(message);
  }, []);
  const clearPremiumPrompt = useCallback(() => setPremiumPrompt(null), []);

  const isFavorite = useCallback(
    (code: string) => favorites.some((f) => f.code === code),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (item: SearchResult) => {
      const exists = favorites.some((f) => f.code === item.code);
      if (!exists && favorites.length >= favoritesMax) {
        setPremiumPrompt(
          `The free plan keeps up to ${FREE_FAVORITES_MAX} favorites. ` +
            `Unlock unlimited favorites with premium.`,
        );
        return;
      }
      updateFavorites((prev) => {
        if (prev.some((f) => f.code === item.code)) {
          return prev.filter((f) => f.code !== item.code);
        }
        return [
          {
            code: item.code,
            description: item.description,
            isBillable: item.isBillable,
            category: item.category,
            categoryName: item.categoryName,
            addedAt: Date.now(),
          },
          ...prev,
        ];
      });
    },
    [favorites, favoritesMax, updateFavorites],
  );

  const removeFavorite = useCallback(
    (code: string) => {
      updateFavorites((prev) => prev.filter((f) => f.code !== code));
    },
    [updateFavorites],
  );

  const createCollection = useCallback(
    (name: string, emoji: string): string | null => {
      if (collections.length >= collectionsMax) {
        setPremiumPrompt(
          `The free plan keeps up to ${FREE_COLLECTIONS_MAX} collections. ` +
            `Unlock unlimited collections with premium.`,
        );
        return null;
      }
      const id = crypto.randomUUID();
      updateCollections((prev) => [
        ...prev,
        { id, name, emoji, createdAt: Date.now(), items: [] },
      ]);
      return id;
    },
    [collections, collectionsMax, updateCollections],
  );

  const renameCollection = useCallback(
    (id: string, name: string, emoji: string) => {
      updateCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, emoji } : c)),
      );
    },
    [updateCollections],
  );

  const deleteCollection = useCallback(
    (id: string) => {
      updateCollections((prev) => prev.filter((c) => c.id !== id));
    },
    [updateCollections],
  );

  const addToCollection = useCallback(
    (id: string, item: SearchResult, modifiers?: string) => {
      updateCollections((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // Same code already in -> replace it (so updating the modifier
          // suffix works without producing a duplicate row).
          const filtered = c.items.filter((i) => i.code !== item.code);
          return { ...c, items: [...filtered, toItem(item, modifiers)] };
        }),
      );
    },
    [updateCollections],
  );

  const removeFromCollection = useCallback(
    (id: string, code: string) => {
      updateCollections((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, items: c.items.filter((i) => i.code !== code) }
            : c,
        ),
      );
    },
    [updateCollections],
  );

  const isInCollection = useCallback(
    (id: string, code: string) =>
      collections
        .find((c) => c.id === id)
        ?.items.some((i) => i.code === code) ?? false,
    [collections],
  );

  const setNote = useCallback(
    (code: string, text: string) => {
      updateNotes((prev) => ({
        ...prev,
        [code]: { text, editedAt: Date.now() },
      }));
    },
    [updateNotes],
  );

  const deleteNote = useCallback(
    (code: string) => {
      updateNotes((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
    },
    [updateNotes],
  );

  return (
    <AppDataContext.Provider
      value={{
        ready: favReady && colReady && notesReady,
        favorites,
        isFavorite,
        toggleFavorite,
        removeFavorite,
        collections,
        createCollection,
        renameCollection,
        deleteCollection,
        addToCollection,
        removeFromCollection,
        isInCollection,
        notes,
        setNote,
        deleteNote,
        favoritesMax,
        collectionsMax,
        premiumPrompt,
        promptPremium,
        clearPremiumPrompt,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
