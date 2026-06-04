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
  LibraryItem,
  NoteMap,
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

interface AppData {
  ready: boolean;

  favorites: Favorite[];
  isFavorite: (key: string) => boolean;
  toggleFavorite: (item: LibraryItem) => void;
  removeFavorite: (key: string) => void;

  collections: Collection[];
  createCollection: (name: string, emoji: string) => string | null;
  renameCollection: (id: string, name: string, emoji: string) => void;
  deleteCollection: (id: string) => void;
  addToCollection: (id: string, item: LibraryItem) => void;
  removeFromCollection: (id: string, key: string) => void;
  isInCollection: (id: string, key: string) => boolean;

  notes: NoteMap;
  setNote: (key: string, text: string) => void;
  deleteNote: (key: string) => void;

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
    (key: string) => favorites.some((f) => f.key === key),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (item: LibraryItem) => {
      const exists = favorites.some((f) => f.key === item.key);
      if (!exists && favorites.length >= favoritesMax) {
        setPremiumPrompt(
          `The free plan keeps up to ${FREE_FAVORITES_MAX} favorites. ` +
            `Unlock unlimited favorites with premium.`,
        );
        return;
      }
      updateFavorites((prev) => {
        if (prev.some((f) => f.key === item.key)) {
          return prev.filter((f) => f.key !== item.key);
        }
        return [{ ...item, addedAt: Date.now() }, ...prev];
      });
    },
    [favorites, favoritesMax, updateFavorites],
  );

  const removeFavorite = useCallback(
    (key: string) => {
      updateFavorites((prev) => prev.filter((f) => f.key !== key));
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
    (id: string, item: LibraryItem) => {
      updateCollections((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // Same key already in -> no-op (avoids duplicate rows).
          if (c.items.some((i) => i.key === item.key)) return c;
          const row: CollectionItem = { ...item, addedAt: Date.now() };
          return { ...c, items: [...c.items, row] };
        }),
      );
    },
    [updateCollections],
  );

  const removeFromCollection = useCallback(
    (id: string, key: string) => {
      updateCollections((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, items: c.items.filter((i) => i.key !== key) }
            : c,
        ),
      );
    },
    [updateCollections],
  );

  const isInCollection = useCallback(
    (id: string, key: string) =>
      collections.find((c) => c.id === id)?.items.some((i) => i.key === key) ??
      false,
    [collections],
  );

  const setNote = useCallback(
    (key: string, text: string) => {
      updateNotes((prev) => ({
        ...prev,
        [key]: { text, editedAt: Date.now() },
      }));
    },
    [updateNotes],
  );

  const deleteNote = useCallback(
    (key: string) => {
      updateNotes((prev) => {
        const next = { ...prev };
        delete next[key];
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
