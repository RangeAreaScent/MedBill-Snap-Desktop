/** A row returned by `search_codes`. Mirrors the iOS HCPCSCodeSummary. */
export interface SearchResult {
  code: string;
  shortDescription: string;
  /** Full long_description from CMS. The UI displays this. */
  description: string;
  isBillable: boolean;
  /** One-letter HCPCS section (A, B, C, … V). */
  category: string;
  /** Human-readable section name (e.g. "Durable Medical Equipment"). */
  categoryName: string;
  /** CMS coverage label, when present (e.g. "Carrier judgment"). */
  coverageLabel: string | null;
}

export interface CodeDetail {
  code: string;
  shortDescription: string;
  description: string;
  isBillable: boolean;
  category: string;
  categoryName: string;
  coverage: string | null;
  coverageLabel: string | null;
  actionCode: string | null;
  actionLabel: string | null;
  addedDate: string | null;
  effectiveDate: string | null;
  terminationDate: string | null;
}

export interface ModifierSummary {
  modifier: string;
  shortDescription: string;
  description: string;
  category: string;
  isCurrent: boolean;
}

export interface ModifierDetail extends ModifierSummary {
  actionCode: string | null;
  addedDate: string | null;
  effectiveDate: string | null;
  terminationDate: string | null;
}

export interface Favorite {
  code: string;
  description: string;
  isBillable: boolean;
  category: string;
  categoryName: string;
  addedAt: number;
}

export interface CollectionItem {
  code: string;
  description: string;
  isBillable: boolean;
  category: string;
  categoryName: string;
  /** Optional modifier suffix the user pinned with this item (e.g. "RR-KX").
   *  Empty / undefined when the code was added without modifiers. */
  modifiers?: string;
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

/** Map of HCPCS code -> note. */
export type NoteMap = Record<string, Note>;
