# MedBill Snap Desktop

Fast, offline reference for U.S. medical billing — **POS codes**, **HCPCS
modifiers**, **MS-DRGs**, and **ICD → DRG** reverse lookup. Mac + Windows.
Sister desktop port of the iOS app [MedBill Snap](https://github.com/RangeAreaScent/MedBill-Snap).

> ⚠ **Status: Phase A scaffold (Stage 1).** The Rust backend is
> feature-complete and verified against the bundled dataset, but the
> frontend is intentionally minimal — a 4-mode search picker only. Detail
> panes, favorites, collections, the CC/MCC impact calculator UI, the DRG
> browser, settings, and themes all land in Phase B/C. See
> [`HANDOFF.md`](HANDOFF.md) for the full state and roadmap.

## What's in the dataset

Bundled `medbill_v1.sqlite` 14.6 MB — sourced from the CMS Definitions
Manual v43.0 + Table 5 FY 2026 Final Rule weights. License: CMS public
domain. AMA CPT codes are excluded by design.

| Table | Rows |
|---|---|
| Place of Service codes | 50 |
| HCPCS Level II modifiers | 47 |
| MS-DRGs (all with FY 2026 weights) | 770 |
| MDC categories | 26 |
| CC / MCC classifications | 18,432 |
| ICD → DRG principal-dx routings | 213,321 |
| Billing topics | 8 |

Integrity-verified: `PRAGMA integrity_check` ok, FK-clean, FTS in sync,
byte-identical to the iOS app's bundled copy (SHA256 `c7a79351…`).

## Tech stack

- **Shell** — Tauri 2 (Rust backend, system webview frontend)
- **UI** — React 19 + TypeScript + Vite
- **Read-only DB** — `rusqlite` with bundled SQLite + FTS5
- **User data** — atomic JSON in the app data directory
- **Premium license** — Lemon Squeezy (online activate / validate)
- **PDF export** — `printpdf` 0.8 with bundled NanumGothic for CJK

## Quick start (dev)

```bash
npm install
npm run tauri dev          # Vite + Tauri dev shell
```

## Stability gates

Run before any commit touching `medbill.rs` / `lib.rs` / `types.ts` / `api.ts`:

```bash
cd src-tauri
cargo check                          # backend compiles
cargo test --lib medbill::           # 7 domain tests vs bundled DB

cd ..
npx tsc --noEmit                     # frontend types check
npm run build                        # tsc + Vite bundle
```

Phase A baseline (2026-06-04): all four gates green.

## Docs

- [`HANDOFF.md`](HANDOFF.md) — full developer/maintainer reference, Phase A
  status, Phase B/C roadmap, gotchas
- [`RELEASE.md`](RELEASE.md) — release procedure (Phase B/C — currently
  inherited template, will be rewritten when Lemon Squeezy + CI are wired)

## Repos in this app

- iOS: <https://github.com/RangeAreaScent/MedBill-Snap>
- Desktop (this repo): <https://github.com/RangeAreaScent/MedBill-Snap-Desktop>

## License

Source: **MIT** — see [`LICENSE`](LICENSE).
Dataset: **CMS public domain** — see [`LICENSE`](LICENSE) and
[`HANDOFF.md`](HANDOFF.md) for the full attribution chain.
Bundled font (NanumGothic): **SIL Open Font License 1.1**.
