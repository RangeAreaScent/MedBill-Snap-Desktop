# Releasing MedBill Snap Desktop

> **Phase A status (2026-06-04):** no release procedure yet. The
> inherited HCPCS `.github/workflows/build.yml` was removed during the
> fork cleanup (it referenced HCPCS tags / artifact names). CI + release
> wiring is **Phase C** work.
>
> Until then, packaging is **local-only**:
>
> ```bash
> # macOS — Apple Silicon
> npm run tauri build
>
> # macOS — Universal (Intel + Apple Silicon)
> rustup target add x86_64-apple-darwin
> npm run tauri build -- --target universal-apple-darwin
>
> # Windows (on a Windows machine with VS 2022 Build Tools)
> npm run tauri build
> ```
>
> Note that `npm run tauri build` has **not been smoke-tested yet** in
> this project — it's the next gate after the Phase A bootstrap. The
> backend `cargo check` + `cargo test` + frontend `tsc` + `vite build`
> all pass, so the Tauri bundle step is the missing-but-expected-to-work
> piece.

---

## Phase C release prep (when we get there)

1. **`tauri build` smoke test** on macOS arm64 — confirm the bundled
   `medbill_v1.sqlite` resource resolves at runtime and the four search
   modes return live data in the packaged app.
2. **GitHub Actions CI** — port the HCPCS desktop's `build.yml` (Mac
   universal + Windows) with MedBill product / tag / artifact strings.
   Template in [`../HCPCS Snap_Mac_Win_app/HANDOFF.md`](../HCPCS%20Snap_Mac_Win_app/HANDOFF.md)
   Appendix A.
3. **Lemon Squeezy product** — register "MedBill Snap Desktop Premium",
   note the `product_id`, fill `EXPECTED_PRODUCT_ID` in
   `src-tauri/src/license.rs` (currently a no-op check inherited from
   HCPCS).
4. **Code signing & notarization** (macOS) — same env-var contract as
   ICD / HCPCS:
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="TEAMID"
   ```
5. **Windows code signing** — add a `certificateThumbprint` block under
   `tauri.conf.json` → `bundle.windows`.
6. **First release tag** — push `v1.0.0`; CI builds DMG / MSI / NSIS;
   draft a GitHub release with the three artifacts.

See [`HANDOFF.md`](HANDOFF.md) for the Phase A → B → C roadmap.
