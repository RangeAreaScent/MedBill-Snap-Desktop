# MedBill Snap Desktop — Handoff

<!-- snap-series:manager-block:start -->
- **App:** MedBill Snap
- **Platform:** desktop (Mac + Windows, Tauri 2)
- **Wave:** 3
- **Stage:** 2 features  <!-- 0 spec / 1 scaffold / 2 features / 3 release / shipped -->
- **Last updated:** 2026-06-04
- **Repo:** local only — not a git repo yet
- **Latest release:** none
- **Latest CI:** n/a (no CI)
- **Bundle id:** `com.ryan.medbillsnap`
- **Dataset:** bundled `medbill_v1.sqlite` 14.6 MB — full CMS Definitions Manual v43.0 + Table 5 FY 2026 weights (SHA256 `c7a79351…2574 07`, byte-identical to the iOS app's `MedBillSnap/Data/medbill_v1.sqlite`). Row counts: POS 50 · HCPCS modifiers 47 · MS-DRG 770 (all with FY 2026 weights) · MDC 26 · CC/MCC 18,432 · drg_icd_mapping 213,321 · billing_topics 8. License: CMS public domain (AMA CPT excluded by design).
- **Deviations from playbook:** Forked from `HCPCS Snap_Mac_Win_app` (closest CMS-domain sibling). Frontend rebuilt minimal — the HCPCS-shaped React components are preserved at `_legacy_hcpcs_frontend/` as Phase B/C reference but not in the build path.
- **Active blockers (Phase B → C handoff):**
  - **CSS is utility-only.** Phase B added ~330 lines of MedBill-specific styles to `styles.css` for legibility of new components (tab bar, chips, calculator, browser cards, calc pills). The inherited HCPCS theme tokens (`--bg`, `--accent`, `--border` etc.) still drive overall look. **Phase C task**: full retheme + premium-theme verification across all 6 tabs.
  - **`pdf.rs` ExportEntry shape unchanged** — still HCPCS-named fields (`category`, `categoryName`, `coverage`). MedBill `export.ts` driver not ported yet. Add to-CSV / to-PDF in Phase C alongside the export UI button in CollectionDetailView.
  - **`AddCodeModal` not ported** — the legacy HCPCS pattern allowed manually adding a code by typing the code string. Less applicable to MedBill (4 separate item types), so deferred until Phase C feature-prioritization decides whether it's needed.
  - **`tauri build` not yet attempted** — universal DMG smoke test pending. `cargo check` + `cargo test --lib` (medbill module) + `npm run build` all green; the bundling step is the next gate (Windows verification deferred — CI's `build` job covers it on tag push).
  - No Lemon Squeezy product registered yet (the `EXPECTED_PRODUCT_ID` no-op check inherited from HCPCS).
- **Phase B feature wire landed 2026-06-04:**
  - **Tab shell** — new `App.tsx` 6-tab layout: Search · Calculator · DRG Browser · Favorites · Collections · Settings. Master-detail split-pane for the four library tabs (left list + right detail); full-width for Calculator + Settings.
  - **State providers** — `state.tsx` (favorites/collections/notes keyed by `LibraryItem.key` — POS/MOD/DRG namespaced) + `settings.tsx` (theme · font · text size · license · hidden override). Freemium caps preserved (15 favorites / 10 collections free; unlimited on premium).
  - **Components** (12 new under `src/components/`):
    - `SearchView` — 4-mode picker (POS · Modifier · MS-DRG · ICD→DRG) with 180 ms debounced search
    - `CodeRow` — kind-aware chip (POS blue, MOD teal, DRG purple) with star toggle
    - `CodeDetailView` — kind-aware body sections (POS notes/dates · MOD usage/billing/category/year · DRG weight/GMLOS/AMLOS/MDC/FY) + per-item notes textarea
    - `FavoritesView` / `CollectionsView` — accept all three kinds, re-render via `Favorite/CollectionItem → SearchResult` reconstruction
    - `AddToCollectionModal` — pick-list with already-added state
    - `CCMCCCalculatorView` (MedBill-first) — principal ICD-10 + secondary pill-list with auto-classified CC/MCC chips → live `compute_impact` → routed DRG + baseline-vs-routed weight delta + candidate list with severity badges + "Open" handoff to detail
    - `DRGBrowserView` (MedBill-first) — 26 MDC cards with per-MDC DRG count; expand to load via `list_drgs_by_mdc`
    - `SettingsView` — full Appearance (free + premium themes, font, text size) + Premium box (license activate/validate/deactivate + hidden 6-tap rhythm for override) + MedBill Data section (full row-count table) + About
    - Reused verbatim (zero changes): `Modal`, `PremiumPromptModal`, `CollectionFormModal`
  - **CSS** — ~330 lines of MedBill-specific rules appended to `styles.css` for new class names (`.shell`, `.tab-bar`, `.code-chip--{pos,mod,drg}`, `.calc-view`, `.pill--{mcc,cc,none}`, `.weight-delta`, `.delta--{pos,neg}`, `.mdc-card`, etc.). Inherited theme tokens still drive overall look (Phase C retheme).
  - **Bundle delta**: JS 196 KB → 249 KB (+53 KB), CSS 0 KB → 32 KB (newly bundled — Phase A's minimal App didn't import styles.css). Gzipped: 62 KB → 75 KB JS + 6.5 KB CSS.

- **Phase A1 mop-up landed 2026-06-04 (post-bootstrap):**
  - **MIT LICENSE** added — first in the Snap series. Covers source MIT + bundled CMS public-domain attribution + NanumGothic OFL.
  - **App icons regenerated** from the iOS `AppIcon.png` (1024×1024) via `npx tauri icon` — produces `icon.icns` (129 KB), `icon.ico` (24 KB), full PNG size set (32×32 through 310×310) + StoreLogo. iOS/Android icon sets also emitted (irrelevant for desktop but harmless).
  - **CI workflow** at `.github/workflows/build.yml` — two-job design:
    - `check` job on every push to main + every PR (ubuntu-latest, ~3 min): `cargo check` → `cargo test --lib medbill::` → `npx tsc --noEmit` → `npm run build`. Catches regressions before any tagging.
    - `build` job on `v*` tags + manual dispatch (macOS-latest universal + windows-latest): cargo test pre-build verify → `tauri-action` → draft GitHub release with DMG / MSI / NSIS artifacts.
    - macOS code-signing env vars (`APPLE_*`) referenced but optional — unsigned build still produces working artifacts until the Apple cert lands.
  - **Public-facing text mop-up** — `README.md` rewritten as MedBill (was HCPCS pitch), `RELEASE.md` downgraded to Phase C placeholder, `index.html` title fixed.
- **Phase A stability gates (all passed 2026-06-04):**
  - `cargo check` ✓ — Rust backend compiles clean (medbillsnap 1.0.0)
  - `cargo test --lib medbill::` ✓ — 7/7 unit tests pass against the bundled DB:
    - POS prefix search (`"11"` → POS 11 Office)
    - DRG FTS smoke (`"heart failure"` → 291/292/293 triplet)
    - ICD→DRG routing (`I50.9` → 291/292/293)
    - CC/MCC classify (`N17.9` → CC)
    - Impact (`I50.9` + `N17.9` → routes to 292 With CC)
    - `list_mdcs` returns 26
    - `list_topics` returns 8
  - `npm install` ✓ — 75 packages, 0 vulnerabilities
  - `npx tsc --noEmit` ✓ — exit 0
  - `npm run build` ✓ — Vite bundle 196 KB JS / 62 KB gzipped, 501 ms
- **Next 3 steps (Phase C):**
  1. **`tauri build` smoke test on macOS** — confirm the bundled DB resource resolves at runtime (`tauri::path::BaseDirectory::Resource`), each tab renders against live data, and the calculator returns end-to-end correct routings in the packaged app. (Windows verification deferred — CI's `build` job covers it on tag push.)
  2. **Full retheme + premium-theme polish** — verify all 7 themes (3 free + 4 premium) render cleanly across all 6 tabs. Audit the inherited HCPCS theme tokens for MedBill-appropriate accent colors (purple-DRG, teal-MOD).
  3. **Export wiring + Lemon Squeezy product** — port `export.ts` from the legacy frontend (kind-aware CSV/PDF row composition), update `pdf.rs` ExportEntry field semantics. Register Lemon Squeezy product, fill `EXPECTED_PRODUCT_ID`.
- **Report-back trigger:** any `tauri build` outcome, any commit touching `medbill.rs` / `lib.rs` / `tauri.conf.json`, dataset swap (next CMS quarter, FY 2027 = Oct 2026), Phase B → C handoff.
<!-- snap-series:manager-block:end -->

---

## 1. Series context

MedBill Snap Desktop is the Mac + Windows companion to the iOS app
**MedBill Snap** (`/Users/ryan/Projects/MedBill-Snap/`). It shares no code
with the iOS app — the iOS source is reference only — but the two ship
the same bundled SQLite (`medbill_v1.sqlite`, byte-identical, 14.6 MB).

For series-wide conventions see `/Users/ryan/Projects/SNAP Series Plan/`
(`SNAP_SERIES_GUIDE.md`, `SNAP_SERIES_STATUS.md`). The structural template
for this app is the sibling `../HCPCS Snap_Mac_Win_app/` — same Tauri 2 +
React 19 + Vite shell, same Lemon Squeezy license layer, same atomic
JSON store, same NanumGothic-embedded PDF exporter.

**Why HCPCS as the fork base** (vs ICD): both apps are CMS-sourced
medical-billing tools, both ship a modifier-rich detail surface, both
need FTS-backed search across multiple table families. The HCPCS desktop
codebase already solved those problems, so MedBill picks them up
verbatim and only replaces the domain layer.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (Rust backend, system webview frontend) |
| UI | React 19 + TypeScript + Vite |
| Backend lang | Rust (stable, edition 2021) |
| Read-only DB | `medbill_v1.sqlite` (~14.6 MB), bundled as a Tauri resource. Three FTS5 indexes (`pos_fts`, `modifier_fts`, `drg_fts`). Rust-side via `rusqlite` with `bundled` (compiles SQLite + FTS5 in-tree). |
| User data | Plain JSON files in the app data directory, written atomically (`store.rs`). |
| Search abbreviations | Static dictionary in `abbreviations.rs`, ported from HCPCS Snap desktop. Same combined HCPCS + ICD dictionary (audience overlaps with billing/diagnosis vocabulary). |
| Premium license | Lemon Squeezy license API via `ureq`. `INSTANCE_NAME = "MedBill Snap Desktop"`. |
| PDF export | Native generation via `printpdf 0.8` (font subsetting) with bundled NanumGothic for CJK glyphs. |

---

## 3. Repository layout

```
MedBill Snap_Mac_Win_app/
├── HANDOFF.md                       ← this file
├── README.md                        ← MedBill-flavored, links to LICENSE + iOS sibling repo
├── RELEASE.md                       ← Phase C placeholder (CI lands here when Lemon Squeezy + cert ready)
├── LICENSE                          ← MIT + CMS public-domain attribution + OFL font notice
├── .github/workflows/build.yml      ← check on push/PR + build on `v*` tags (Mac universal + Windows)
├── package.json                     ← name = "medbill-snap-desktop"
├── tsconfig.json                    ← include: ["src"] only — legacy dir excluded
├── vite.config.ts
├── index.html
├── src/                             ← React/TS frontend (Phase A minimal)
│   ├── main.tsx                     ← React root + bundled font imports
│   ├── App.tsx                      ← 4-mode picker + search input + result list
│   ├── api.ts                       ← Tauri invoke wrappers (one per command)
│   ├── types.ts                     ← SearchResult tagged union + LibraryItem
│   ├── styles.css                   ← inherited from HCPCS; Phase B will retheme
│   └── vite-env.d.ts
├── _legacy_hcpcs_frontend/          ← Phase B/C reference — NOT in tsc include
│   ├── App.tsx                      ← original HCPCS 5-tab shell
│   ├── state.tsx                    ← favorites/collections/notes provider
│   ├── settings.tsx                 ← theme + license provider
│   ├── api.ts                       ← original HCPCS API wrappers
│   ├── types.ts                     ← original HCPCS types
│   ├── export.ts                    ← CSV / PDF export drivers
│   └── components/                  ← 13 HCPCS-shaped components
└── src-tauri/                       ← Rust backend (Phase A complete)
    ├── Cargo.toml                   ← crate `medbillsnap`, lib `medbillsnap_lib`
    ├── tauri.conf.json              ← productName "MedBill Snap" + medbill_v1.sqlite resource
    ├── build.rs                     ← tauri-build (unchanged)
    ├── capabilities/default.json    ← webview permissions (unchanged from HCPCS)
    ├── icons/                       ← MedBill icons (regenerated via `npx tauri icon`)
    ├── resources/
    │   ├── medbill_v1.sqlite        ← 14.6 MB CMS dataset
    │   └── fonts/NanumGothic-{Regular,Bold}.ttf
    └── src/
        ├── main.rs                  ← 3-line entry; calls medbillsnap_lib::run()
        ├── lib.rs                   ← Tauri Builder + 20 invoke handlers
        ├── medbill.rs               ← NEW — search/detail/classify/impact/MDC/topics
        ├── abbreviations.rs         ← HCPCS + ICD combined dictionary (unchanged content)
        ├── store.rs                 ← atomic JSON document store (unchanged)
        ├── license.rs               ← Lemon Squeezy + override (INSTANCE_NAME swapped)
        └── pdf.rs                   ← collection → PDF (header text swapped only)
```

---

## 4. Tauri commands (Phase A)

All commands live in `src-tauri/src/lib.rs`; the domain logic lives in `medbill.rs`.

| Command | Args | Returns | Notes |
|---|---|---|---|
| `search_pos` | `query: string, limit?: number` | `SearchResult[]` | Code prefix + FTS, deduped |
| `search_modifiers` | `query: string, limit?: number` | `SearchResult[]` | Code prefix + FTS; empty query lists all |
| `search_drgs` | `query: string, limit?: number` | `SearchResult[]` | DRG number prefix + FTS |
| `search_drgs_by_icd` | `icd: string, limit?: number` | `SearchResult[]` | Reverse lookup, sorted MCC → CC → w/o |
| `get_pos_detail` | `code: string` | `PosDetail \| null` | |
| `get_modifier_detail` | `code: string` | `ModifierDetail \| null` | |
| `get_drg_detail` | `number: string` | `DrgDetail \| null` | Joins `mdc_categories` for `mdcName` |
| `classify_icd` | `icd: string` | `CcMccEntry` | Always returns; `level: "none"` if unknown |
| `compute_impact` | `principalIcd: string, secondaryIcds: string[]` | `ImpactResult` | Routes to highest-severity candidate matching aggregated CC/MCC |
| `list_mdcs` | — | `MdcCategory[]` | 26 MDCs with per-MDC DRG counts |
| `list_drgs_by_mdc` | `mdcCode: string` | `SearchResult[]` | All DRGs in an MDC, sorted by number |
| `list_topics` | — | `BillingTopic[]` | 8 topics; `relatedCodes` parsed from CSV |
| `store_read` / `store_write` | `name, content?` | JSON document IO | atomic temp-rename |
| `write_text_file` / `export_pdf` | path-driven IO | — | for CSV / PDF export |
| `license_status` / `_activate` / `_validate` / `_deactivate` / `_toggle_override` | — | `LicenseState` | Lemon Squeezy + override layer |

---

## 5. Running in development

```bash
# one-time
cd "/Users/ryan/Projects/MedBill Snap_Mac_Win_app"
npm install

# every session
npm run tauri dev
```

Vite serves at `http://localhost:1420`; Rust binary builds in dev mode;
the app window opens. Frontend changes hot-reload; Rust changes
trigger a recompile-and-relaunch.

Phase A note: the UI shows a 4-mode picker + a single search input.
Type into the input → results stream in 150 ms after the last keystroke.
Detail panes, favorites, collections etc. are Phase B work.

---

## 5.1 Per-app gotchas (caught during Phase A bootstrap)

- **⚠ `.git` / `.github` inheritance from the rsync fork (caught 2026-06-04).**
  The Phase A fork was done with `rsync -a --exclude='node_modules' ...`
  but `.git/` was NOT excluded, so the upstream HCPCS desktop's git
  history + `origin → hcpcs-snap-desktop.git` remote tagged along. The
  inherited `.github/workflows/build.yml` would have run CI against
  HCPCS's tag / artifact names. **A `git push` from that state would
  have shipped MedBill commits into the HCPCS repo.** Caught at the
  pre-commit `git remote -v` check.
  - **Fix applied**: `rm -rf .git .github` → `git init -b main` → fresh
    history → `gh repo create RangeAreaScent/MedBill-Snap-Desktop`
    (the correct remote).
  - **For future forks** (Phase B/C and any other Snap desktop port):
    always exclude `.git` and `.github` in the initial copy. The
    series-wide playbook `/Users/ryan/Projects/SNAP Series Plan/SNAP_SERIES_GUIDE.md` §6
    now carries the same warning at the top of the "Fork approach"
    section.

---

## 6. Stability gates

Run these before any commit that touches `medbill.rs` / `lib.rs` / `types.ts` / `api.ts`:

```bash
cd "/Users/ryan/Projects/MedBill Snap_Mac_Win_app/src-tauri"
cargo check                       # backend compiles
cargo test --lib medbill::        # 7 domain-layer tests vs bundled DB

cd "/Users/ryan/Projects/MedBill Snap_Mac_Win_app"
npx tsc --noEmit                  # frontend types check
npm run build                     # tsc + Vite bundle
```

Phase A baseline (2026-06-04): all four gates green.

---

## 7. Next steps in detail

### 7.1 Phase B feature wire

Port the legacy HCPCS components into MedBill-shaped equivalents. The
`LibraryItem` type in `src/types.ts` already provides the namespaced-key
shape (`pos:11` / `mod:LT` / `drg:291`) the iOS app uses — both apps will
treat favorites/collections identically. The legacy state.tsx / settings.tsx
in `_legacy_hcpcs_frontend/` are reusable with minimal swap (replace the
HCPCS `SearchResult` with `LibraryItem`).

### 7.2 Phase C release prep

`tauri build` smoke test on macOS arm64 → universal target → Windows VM.
Register Lemon Squeezy product, fill `EXPECTED_PRODUCT_ID` in `license.rs`,
draft GitHub release with the DMG / MSI / NSIS artifacts.

---

## 8. Reference paths

- iOS app source + spec: `/Users/ryan/Projects/MedBill-Snap/`
- iOS HANDOFF: `/Users/ryan/Projects/MedBill-Snap/HANDOFF.md`
- Fork base (HCPCS desktop): `/Users/ryan/Projects/HCPCS Snap_Mac_Win_app/`
- HCPCS desktop HANDOFF (reference for §5–§17 patterns we'll port in Phase B): `/Users/ryan/Projects/HCPCS Snap_Mac_Win_app/HANDOFF.md`
- ICD desktop (sibling for theme/settings polish): `/Users/ryan/Projects/ICD Snap_mac_win_app/`
- Data pipeline (source of `medbill_v1.sqlite`): `/Users/ryan/Projects/MedBill-Snap/data/`
- Series playbook: `/Users/ryan/Projects/SNAP Series Plan/SNAP_SERIES_GUIDE.md`
- Series dashboard: `/Users/ryan/Projects/SNAP Series Plan/SNAP_SERIES_STATUS.md`

---

*Phase A bootstrap landed 2026-06-04. Bump the manager block's
`Last updated`, `Stage`, and `Next 3 steps` as Phase B / C progress.*
