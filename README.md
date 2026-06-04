# HCPCS Snap Desktop

Fast, offline HCPCS Level II code lookup for medical billers, DME
suppliers, and ambulance billers. Mac + Windows.

- **Search** — 8,727 codes + 384 modifiers, FTS5-indexed
- **Modifiers** — multi-select picker that builds billing lines like
  `E0114-RR-KX` in one click
- **Favorites + Collections** — group codes, add notes, export to CSV
  or PDF (Korean notes supported)
- **Premium** — 4 extra themes + unlimited favorites/collections
  (Lemon Squeezy license, one-time purchase)
- **Offline-first** — no data leaves the machine except license
  activation

## Docs

- [`HANDOFF.md`](HANDOFF.md) — full developer/maintainer reference
- [`RELEASE.md`](RELEASE.md) — how to cut a Windows release via CI

## Quick start (dev)

```bash
npm install
npm run tauri dev
```

## Build

Mac (Apple Silicon):
```bash
npm run tauri build
```

Windows: push a `v*` tag and let the GitHub Actions workflow handle it
(`.github/workflows/build.yml`).
