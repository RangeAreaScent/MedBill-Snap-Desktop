// =====================================================================
// MedBill domain types — mirror src-tauri/src/medbill.rs
// =====================================================================

export type SearchMode = "pos" | "modifier" | "drg" | "icdToDrg";

/** Tagged union over the four search modes. */
export type SearchResult =
  | { kind: "pos"; code: string; name: string; description: string }
  | {
      kind: "modifier";
      code: string;
      name: string;
      description: string;
      category: string | null;
    }
  | {
      kind: "drg";
      number: string;
      name: string;
      mdcCode: string | null;
      drgType: string | null;
      severity: string | null;
      relativeWeight: number | null;
    };

export interface PosDetail {
  code: string;
  name: string;
  description: string;
  notes: string | null;
  effectiveDate: string | null;
  lastUpdated: string | null;
}

export interface ModifierDetail {
  code: string;
  name: string;
  description: string;
  usageExample: string | null;
  billingImpact: string | null;
  category: string | null;
  effectiveYear: number | null;
}

export interface DrgDetail {
  number: string;
  name: string;
  mdcCode: string | null;
  mdcName: string | null;
  drgType: string | null;
  severity: string | null;
  relativeWeight: number | null;
  geometricMeanLos: number | null;
  arithmeticMeanLos: number | null;
  effectiveFy: number | null;
  notes: string | null;
}

export interface MdcCategory {
  code: string;
  name: string;
  description: string | null;
  drgCount: number;
}

export interface BillingTopic {
  slug: string;
  name: string;
  description: string | null;
  relatedCodes: string[];
}

export type CcMccLevel = "mcc" | "cc" | "none";

export interface CcMccEntry {
  icdCode: string;
  level: CcMccLevel;
  description: string | null;
}

export interface ImpactCandidate {
  number: string;
  name: string;
  mdcCode: string | null;
  drgType: string | null;
  severity: string | null;
  relativeWeight: number | null;
  geometricMeanLos: number | null;
}

export interface ImpactResult {
  principalIcd: string;
  highestSecondaryLevel: CcMccLevel;
  secondaryClassifications: CcMccEntry[];
  candidateDrgs: ImpactCandidate[];
  baselineDrg: ImpactCandidate | null;
  routedDrg: ImpactCandidate | null;
  weightDelta: number | null;
}

// =====================================================================
// Library types — favorites, collections, notes (kind-aware)
// =====================================================================

/** Flat row used by favorites / collections — kind + namespaced key. */
export interface LibraryItem {
  /** Namespaced favorite key — "pos:11", "mod:LT", "drg:291". Stable across renames. */
  key: string;
  kind: "pos" | "modifier" | "drg";
  /** Display code shown in lists ("11", "LT", "291"). */
  displayCode: string;
  /** One-line label for lists. */
  name: string;
  /** Longer description for detail. */
  description: string;
}

export interface Favorite extends LibraryItem {
  addedAt: number;
}

export interface CollectionItem extends LibraryItem {
  addedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  items: CollectionItem[];
}

export interface Note {
  text: string;
  editedAt: number;
}

/** Map of LibraryItem.key → note. */
export type NoteMap = Record<string, Note>;

// =====================================================================
// SearchResult → LibraryItem conversion
// =====================================================================

export function toLibraryItem(r: SearchResult): LibraryItem {
  switch (r.kind) {
    case "pos":
      return {
        key: `pos:${r.code}`,
        kind: "pos",
        displayCode: r.code,
        name: r.name,
        description: r.description,
      };
    case "modifier":
      return {
        key: `mod:${r.code}`,
        kind: "modifier",
        displayCode: r.code,
        name: r.name,
        description: r.description,
      };
    case "drg":
      return {
        key: `drg:${r.number}`,
        kind: "drg",
        displayCode: r.number,
        name: r.name,
        description: r.name,
      };
  }
}
