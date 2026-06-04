import { invoke } from "@tauri-apps/api/core";
import type {
  BillingTopic,
  CcMccEntry,
  DrgDetail,
  ImpactResult,
  MdcCategory,
  ModifierDetail,
  PosDetail,
  SearchResult,
} from "./types";

// ---------- search ----------

export function searchPos(query: string, limit = 50): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_pos", { query, limit });
}

export function searchModifiers(
  query: string,
  limit = 100,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_modifiers", { query, limit });
}

export function searchDrgs(query: string, limit = 50): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_drgs", { query, limit });
}

export function searchDrgsByIcd(
  icd: string,
  limit = 50,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_drgs_by_icd", { icd, limit });
}

// ---------- detail ----------

export function getPosDetail(code: string): Promise<PosDetail | null> {
  return invoke<PosDetail | null>("get_pos_detail", { code });
}

export function getModifierDetail(
  code: string,
): Promise<ModifierDetail | null> {
  return invoke<ModifierDetail | null>("get_modifier_detail", { code });
}

export function getDrgDetail(number: string): Promise<DrgDetail | null> {
  return invoke<DrgDetail | null>("get_drg_detail", { number });
}

// ---------- CC/MCC + impact ----------

export function classifyIcd(icd: string): Promise<CcMccEntry> {
  return invoke<CcMccEntry>("classify_icd", { icd });
}

export function computeImpact(
  principalIcd: string,
  secondaryIcds: string[],
): Promise<ImpactResult> {
  return invoke<ImpactResult>("compute_impact", { principalIcd, secondaryIcds });
}

// ---------- MDC browser + topics ----------

export function listMdcs(): Promise<MdcCategory[]> {
  return invoke<MdcCategory[]>("list_mdcs");
}

export function listDrgsByMdc(mdcCode: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("list_drgs_by_mdc", { mdcCode });
}

export function listTopics(): Promise<BillingTopic[]> {
  return invoke<BillingTopic[]>("list_topics");
}

// ---------- store ----------

export async function storeRead<T>(name: string): Promise<T | null> {
  const raw = await invoke<string | null>("store_read", { name });
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function storeWrite(name: string, value: unknown): Promise<void> {
  return invoke<void>("store_write", {
    name,
    content: JSON.stringify(value),
  });
}
