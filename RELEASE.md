# Releasing HCPCS Snap (Windows)

> Quick reference for cutting a Windows release. The workflow at
> `.github/workflows/build.yml` runs on **windows-latest** and produces
> both an MSI installer (enterprise-friendly) and an NSIS `.exe` setup
> wizard (smaller, friendlier double-click).
>
> Mac packaging is not wired up yet — add a `macos-latest` job to the
> workflow when you're ready (template in `HANDOFF.md` Appendix A).

---

## 0. One-time setup (already done)

- `gh` CLI logged in.
- Private GitHub repo created and pushed.
- `.github/workflows/build.yml` committed.

That's everything. Nothing else to configure for unsigned builds.

---

## 1. Test build (no release)

Use this any time you want to sanity-check the Windows build without
publishing anything.

```bash
gh workflow run build.yml
```

Then watch it:

```bash
gh run watch          # picks the most recent run
# or
gh run list --workflow build.yml
gh run view <run-id> --log
```

When it finishes (≈ 8–12 min cold, 3–5 min cached), download the
artifacts to your Mac:

```bash
gh run download <run-id> -n hcpcs-snap-windows -D ./win-build
ls ./win-build
# msi/HCPCS Snap_1.0.0_x64_en-US.msi
# nsis/HCPCS Snap_1.0.0_x64-setup.exe
```

Ship one of these to a Windows tester to confirm it installs cleanly.

---

## 2. Cut a real release

### 2.1 Bump the version in three places

All three must match:

```bash
# 1. package.json
#    "version": "1.0.1"
# 2. src-tauri/Cargo.toml
#    version = "1.0.1"
# 3. src-tauri/tauri.conf.json
#    "version": "1.0.1"
```

Quick one-liner check:

```bash
grep -E '"version"|^version' package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
```

### 2.2 Commit + tag

```bash
git add -A
git commit -m "release: v1.0.1"
git tag v1.0.1
git push
git push --tags
```

The tag push triggers `build.yml`. It builds Windows installers and
**attaches them to a draft GitHub Release** named `HCPCS Snap v1.0.1`.

### 2.3 Edit + publish the release

While the build runs (≈ 10 min):

```bash
gh run watch
```

When it's done:

```bash
gh release view v1.0.1 --web
```

In the browser:
1. Edit the release body — what changed, known issues, install notes
   (see template below).
2. Confirm both files are attached:
   `HCPCS Snap_1.0.1_x64_en-US.msi` and `HCPCS Snap_1.0.1_x64-setup.exe`.
3. Click **Publish release**.

Or publish from CLI without editing:

```bash
gh release edit v1.0.1 --draft=false
```

### 2.4 Default release-note template

```markdown
## HCPCS Snap v1.0.1 (Windows)

Fast offline HCPCS Level II code lookup with modifier picker.

### Install
1. Download `HCPCS Snap_1.0.1_x64-setup.exe` (smaller) or the `.msi`.
2. Double-click. SmartScreen will warn — click **More info → Run anyway**
   (the build is currently unsigned; signing is planned).
3. WebView2 will install in the background if you don't already have it
   (Windows 11 has it preinstalled).

### Requirements
- Windows 10 1809+ or Windows 11
- ~40 MB disk

### Notes
- This is the unsigned build. SmartScreen warnings are expected.
- Premium activation (Lemon Squeezy) is not yet hooked up to a live
  product — the freemium tier and hidden-rhythm override still work.
```

---

## 3. Bypassing SmartScreen (for users)

Until you have a code-signing cert, every Windows user installing
HCPCS Snap will see "Microsoft Defender SmartScreen prevented an
unrecognized app from starting." Tell them:

> Click **More info**, then **Run anyway**.

It looks scary; it's not. Once you ship a signed build (Sectigo /
DigiCert EV cert, ~$200–400/yr), the warning goes away after enough
downloads have built up SmartScreen reputation. Add a
`certificateThumbprint` block under `tauri.conf.json` → `bundle.windows`
to enable signing (see `HANDOFF.md` §6.5).

---

## 4. Hotfix flow

A release shipped with a bug:

```bash
# 1. Fix the bug, commit
git commit -am "fix: modifier picker drops trailing modifier"

# 2. Bump patch version (see §2.1)
# 3. Tag + push
git tag v1.0.2
git push && git push --tags

# 4. Wait for CI, publish the draft Release
```

Users on v1.0.1 don't have auto-update yet — they have to download the
new installer manually. If you want to add auto-update later, Tauri 2's
`tauri-plugin-updater` is the path; needs a signing key and a static
hosting endpoint that serves the update manifest.

---

## 5. Troubleshooting

**The workflow failed during `npm ci`** — your `package-lock.json` is
out of sync with `package.json`. Run `npm install` locally, commit
the lockfile, re-tag.

**The workflow failed during `cargo build`** — paste the error into a
new session. Most common: a new transitive dep that needs a Windows
feature flag. Check the Rust step's logs:

```bash
gh run view --log | grep -A 30 'error\['
```

**MSI / NSIS missing from the Release** — `tauri-action` only attaches
what it produced. If the workflow log says "skipping bundle for ...",
the Tauri config's `bundle.targets` is filtering it out. Should be
`"all"` (it is, in our `tauri.conf.json`).

**iCloud kept rewriting files mid-`git add`** — if your local working
copy is in iCloud Drive (yes), occasionally iCloud touches mtimes and
git sees "no changes" wrongly. Easy fix: `git add -A` twice in a row
or copy the project out of iCloud for release prep.

---

## 6. After your first published release

- Send the `.exe` link to a Windows beta tester.
- Watch for crash reports / install failures.
- File issues directly against the repo.
- When you decide to sign: buy a code-signing cert, add the thumbprint
  to `tauri.conf.json`, re-tag, watch SmartScreen warnings disappear.
- When you decide to sell premium: create the Lemon Squeezy product
  (see `HANDOFF.md` §10), share the checkout URL in-app.
