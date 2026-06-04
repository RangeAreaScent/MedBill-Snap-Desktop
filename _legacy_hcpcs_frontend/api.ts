import { invoke } from "@tauri-apps/api/core";
import type {
  CodeDetail,
  ModifierDetail,
  ModifierSummary,
  SearchResult,
} from "./types";

export function searchCodes(query: string, limit = 50): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_codes", { query, limit });
}

export function getCodeDetail(code: string): Promise<CodeDetail | null> {
  return invoke<CodeDetail | null>("get_code_detail", { code });
}

export function searchModifiers(
  query: string,
  limit = 500,
): Promise<ModifierSummary[]> {
  return invoke<ModifierSummary[]>("search_modifiers", { query, limit });
}

export function getModifierDetail(
  modifier: string,
): Promise<ModifierDetail | null> {
  return invoke<ModifierDetail | null>("get_modifier_detail", { modifier });
}

/** Reads a JSON document by name. Returns null when it does not exist yet. */
export async function storeRead<T>(name: string): Promise<T | null> {
  const raw = await invoke<string | null>("store_read", { name });
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Persists a JSON document by name (written atomically on the Rust side). */
export function storeWrite(name: string, value: unknown): Promise<void> {
  return invoke<void>("store_write", {
    name,
    content: JSON.stringify(value),
  });
}
