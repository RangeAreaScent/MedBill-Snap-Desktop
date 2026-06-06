import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FONT_FAMILIES,
  FONT_LABELS,
  FONT_SIZE_LABELS,
  FONT_SIZES,
  FREE_THEMES,
  PREMIUM_THEMES,
  THEME_LABELS,
  useSettings,
  type FontFamily,
  type Theme,
} from "../settings";
import { FREE_COLLECTIONS_MAX, FREE_FAVORITES_MAX, useAppData } from "../state";

const FONT_PREVIEW: Record<FontFamily, string> = {
  system: '-apple-system, "Segoe UI", Roboto, sans-serif',
  inter: '"Inter Variable", sans-serif',
  atkinson: '"Atkinson Hyperlegible", sans-serif',
  quattro: '"iA Writer Quattro", sans-serif',
};

/** Detects the hidden unlock rhythm — tap-tap · pause · tap-tap · pause ·
 *  tap-tap (6 clicks). Mirrors the iOS app's SecretTapDetector. */
function useSecretRhythm(onTrigger: () => void) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    const t = taps.current;
    if (t.length > 0 && now - t[t.length - 1] > 6000) t.length = 0;
    t.push(now);
    if (t.length > 6) t.splice(0, t.length - 6);
    if (t.length === 6) {
      const g = [
        t[1] - t[0],
        t[2] - t[1],
        t[3] - t[2],
        t[4] - t[3],
        t[5] - t[4],
      ];
      const pair = (x: number) => x < 700;
      const gap = (x: number) => x >= 700 && x <= 4500;
      if (pair(g[0]) && gap(g[1]) && pair(g[2]) && gap(g[3]) && pair(g[4])) {
        taps.current = [];
        onTrigger();
      }
    }
  }, [onTrigger]);
}

const SWATCH: Record<Theme, [string, string]> = {
  system: ["#ffffff", "#1c1d21"],
  light: ["#f4f5f7", "#2f6df0"],
  dark: ["#1e2023", "#5a8df5"],
  "sky-blue": ["#c9d3de", "#5c7ba3"],
  "peach-pink": ["#eac3b7", "#c77f66"],
  "deep-charcoal": ["#262424", "#e8b87a"],
  blueberry: ["#3e4e66", "#b8c9e0"],
};

export function SettingsView() {
  const {
    theme,
    setTheme,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    unlocked,
    licenseKey,
    activateLicense,
    deactivateLicense,
    togglePremiumOverride,
  } = useSettings();

  const [flash, setFlash] = useState<string | null>(null);
  const secretTap = useSecretRhythm(() => {
    togglePremiumOverride().then(() => {
      setFlash("Premium override toggled");
      setTimeout(() => setFlash((f) => (f ? null : f)), 2500);
    });
  });

  return (
    <div className="settings-pane">
      <div className="settings-scroll">
        <h1 className="settings-title">Settings</h1>

        <section className="settings-section">
          <h2 className="settings-heading">Appearance</h2>
          <p className="settings-sub">Free themes</p>
          <div className="theme-grid">
            {FREE_THEMES.map((t) => (
              <ThemeCard
                key={t}
                theme={t}
                selected={theme === t}
                locked={false}
                onClick={() => setTheme(t)}
              />
            ))}
          </div>
          <p className="settings-sub">
            Premium themes {unlocked ? "" : "🔒"}
          </p>
          <div className="theme-grid">
            {PREMIUM_THEMES.map((t) => (
              <ThemeCard
                key={t}
                theme={t}
                selected={theme === t}
                locked={!unlocked}
                onClick={() => unlocked && setTheme(t)}
              />
            ))}
          </div>
          {!unlocked && (
            <p className="settings-hint">Unlock all premium themes below.</p>
          )}

          <p className="settings-sub">Font</p>
          <div className="theme-grid">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f}
                className={`theme-card${
                  fontFamily === f ? " theme-card--selected" : ""
                }`}
                onClick={() => setFontFamily(f)}
              >
                <span
                  className="font-preview"
                  style={{ fontFamily: FONT_PREVIEW[f] }}
                >
                  Aa
                </span>
                <span className="theme-card__label">{FONT_LABELS[f]}</span>
                {fontFamily === f && (
                  <span className="theme-card__check">✓</span>
                )}
              </button>
            ))}
          </div>

          <p className="settings-sub">Text size</p>
          <div className="segmented">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                className={`segmented__opt${
                  fontSize === s ? " segmented__opt--on" : ""
                }`}
                onClick={() => setFontSize(s)}
              >
                {FONT_SIZE_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        <PremiumSection
          unlocked={unlocked}
          licenseKey={licenseKey}
          activateLicense={activateLicense}
          deactivateLicense={deactivateLicense}
          togglePremiumOverride={togglePremiumOverride}
        />

        <InfoPanelSection flash={flash} secretTap={secretTap} />
      </div>
    </div>
  );
}

type InfoPanel = null | "howToUse" | "database" | "about";

function InfoPanelSection({
  flash,
  secretTap,
}: {
  flash: string | null;
  secretTap: () => void;
}) {
  const [open, setOpen] = useState<InfoPanel>(null);
  const close = () => setOpen(null);

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-heading">Help</h2>
        <NavRow label="How to Use" onClick={() => setOpen("howToUse")} />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Data</h2>
        <InfoRow label="Source" value="CMS Definitions Manual v43.0" />
        <InfoRow label="Tables" value="IPPS FY 2026 Final Rule (Table 5)" />
        <InfoRow label="Coverage" value="770 MS-DRGs + 18,432 CC/MCC + 213,321 ICD→DRG" />
        <InfoRow label="License" value="CMS public domain" />
        <NavRow label="Database Details" onClick={() => setOpen("database")} />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">About</h2>
        <div className="info-row">
          <span className="info-row__label">MedBill Snap</span>
          <span
            className="info-row__value"
            onClick={secretTap}
            style={{ cursor: "default" }}
          >
            Version 1.0.0
          </span>
        </div>
        {flash && <p className="settings-hint">{flash}</p>}
        <NavRow label="About This App" onClick={() => setOpen("about")} />
      </section>

      {open === "howToUse" && <HowToUseModal onClose={close} />}
      {open === "database" && <DatabaseModal onClose={close} />}
      {open === "about" && <AboutModal onClose={close} />}
    </>
  );
}

function NavRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="nav-row" onClick={onClick}>
      <span className="nav-row__label">{label}</span>
      <span className="nav-row__chevron">›</span>
    </button>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────

function InfoModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal__header">
          <h3 className="info-modal__title">{title}</h3>
          <button className="modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="info-modal__body">{children}</div>
      </div>
    </div>
  );
}

function ModalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="info-modal__section">
      <h4 className="info-modal__section-heading">{heading}</h4>
      {children}
    </div>
  );
}

function HowToUseModal({ onClose }: { onClose: () => void }) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <InfoModal title="How to Use" onClose={onClose}>
      <ModalSection heading="Search — 4 modes">
        <p>
          MedBill Snap covers four CMS surfaces at once. The search tab has
          a mode picker; the ⌘K command palette searches POS / Modifier /
          DRG in parallel.
        </p>
        <table className="howto-table">
          <tbody>
            <tr>
              <td>POS</td>
              <td>
                <code>11</code> (Office), <code>21</code> (Inpatient),{" "}
                <code>emergency</code>, <code>ambulance</code>
              </td>
            </tr>
            <tr>
              <td>HCPCS Modifier</td>
              <td>
                <code>LT</code>, <code>RT</code>, <code>F1</code>,{" "}
                <code>GA</code>, or category words like <code>anatomical</code>
              </td>
            </tr>
            <tr>
              <td>MS-DRG</td>
              <td>
                <code>291</code> · <code>heart failure</code> · abbreviations
                like <code>CHF</code> / <code>COPD</code> auto-expand
              </td>
            </tr>
            <tr>
              <td>ICD → DRG</td>
              <td>
                <code>I50.9</code> · <code>A41.9</code> · <code>i50.9</code> /
                spaces / 3-char categories like <code>A09</code> all work
              </td>
            </tr>
          </tbody>
        </table>
      </ModalSection>

      <ModalSection heading="CC/MCC Impact Calculator">
        <p>The flagship MedBill workflow — predict the routed DRG in 3 steps:</p>
        <ol>
          <li>
            Enter the <strong>principal ICD-10</strong> (e.g. <code>I50.9</code>{" "}
            for unspecified heart failure).
          </li>
          <li>
            Add <strong>secondary diagnoses</strong> one at a time — each chip
            shows its CC / MCC level automatically.
          </li>
          <li>
            The result panel shows the routed DRG, baseline → routed weight
            delta, and full candidate list. Click "Open" on any candidate to
            jump to its detail.
          </li>
        </ol>
        <p className="howto-note">
          Highest-severity secondary wins: MCC &gt; CC &gt; none. Routing
          assumes the principal-diagnosis table; procedure-driven DRGs
          (transplants, ECMO) are out of scope by design.
        </p>
      </ModalSection>

      <ModalSection heading="DRG Browser">
        <p>
          Expand any of the 26 Major Diagnostic Categories to see every DRG
          inside, sorted by number with severity badges and FY 2026 weights.
          DRGs lazy-load on expand so the initial view is fast.
        </p>
      </ModalSection>

      <ModalSection heading="Favorites & Collections">
        <p>
          Tap the ☆ on any POS / Modifier / DRG to save it to Favorites.
          Group related items into named Collections — useful for case
          encounters, batch audits, or learning sets.
        </p>
        <p className="howto-note">
          Free plan: up to {FREE_FAVORITES_MAX} favorites and{" "}
          {FREE_COLLECTIONS_MAX} collections. Premium removes both limits.
          Notes and the CC/MCC Calculator are always unlimited.
        </p>
      </ModalSection>

      <ModalSection heading="Export">
        <table className="howto-table">
          <tbody>
            <tr>
              <td>Collection CSV</td>
              <td>Open a collection → Export CSV button</td>
            </tr>
            <tr>
              <td>Collection PDF</td>
              <td>Open a collection → Export PDF button</td>
            </tr>
          </tbody>
        </table>
        <p className="howto-note">
          Exports re-fetch the latest detail per item, so renamed names or
          updated weights are picked up at export time.
        </p>
      </ModalSection>

      <ModalSection heading="Keyboard Shortcuts">
        <table className="howto-table howto-table--kbd">
          <tbody>
            <tr>
              <td>
                <kbd>↑</kbd> <kbd>↓</kbd>
              </td>
              <td>Move through rows in the open list</td>
            </tr>
            <tr>
              <td>
                <kbd>Esc</kbd>
              </td>
              <td>Close palette · close detail overlay · focus search</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}K</kbd>
              </td>
              <td>Command palette — search anywhere, jump anywhere</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}F</kbd>
              </td>
              <td>Focus the search input</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}C</kbd>
              </td>
              <td>Copy the selected code</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}D</kbd>
              </td>
              <td>Toggle favorite for the selected item</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}1</kbd>–<kbd>{mod}5</kbd>
              </td>
              <td>
                Jump tabs: Search · Calculator · DRG Browser · Favorites ·
                Collections
              </td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}E</kbd>
              </td>
              <td>Export the open collection as CSV</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}N</kbd>
              </td>
              <td>New search</td>
            </tr>
            <tr>
              <td>
                <kbd>{mod}{","}</kbd>
              </td>
              <td>Settings</td>
            </tr>
          </tbody>
        </table>
      </ModalSection>

      <ModalSection heading="Tips">
        <ul>
          <li>
            ICD codes accept any case and stray spaces:{" "}
            <code>i50.9</code> = <code>I50 .9</code> = <code>I50.9</code>.
          </li>
          <li>
            Abbreviations expand at search time: <code>CHF</code> → heart
            failure DRGs, <code>COPD</code> → 190/191/192, <code>AKI</code>{" "}
            classifies as CC.
          </li>
          <li>
            Cross-MDC routing is shown:{" "}
            <code>I50.9</code> hits DRG 291/292/293 (cardio) <em>and</em>{" "}
            791/793 (newborn). Real-world CMS Grouper behavior.
          </li>
          <li>
            3-char category ICDs work: <code>A09</code> (gastroenteritis),{" "}
            <code>B20</code> (HIV). No decimal required for category-level
            codes.
          </li>
          <li>
            Drag the divider between the list and detail panes to resize.
            The position is remembered between sessions.
          </li>
        </ul>
      </ModalSection>
    </InfoModal>
  );
}

function DatabaseModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoModal title="Database Details" onClose={onClose}>
      <ModalSection heading="Source">
        <p>
          Data is sourced from CMS (Centers for Medicare & Medicaid Services)
          public-domain references — the same authoritative dataset CMS
          publishes annually for fiscal-year IPPS rulemaking.
        </p>
        <table className="info-table">
          <tbody>
            <tr>
              <td>MS-DRG definitions</td>
              <td>CMS Definitions Manual v43.0 (FY 2026)</td>
            </tr>
            <tr>
              <td>Weights / GMLOS / AMLOS</td>
              <td>IPPS FY 2026 Final Rule — Table 5</td>
            </tr>
            <tr>
              <td>POS code set</td>
              <td>CMS Place of Service Codes for Professional Claims</td>
            </tr>
            <tr>
              <td>Modifier set</td>
              <td>HCPCS Level II alpha-numeric modifiers</td>
            </tr>
            <tr>
              <td>Bundle</td>
              <td>
                <code>medbill_v1.sqlite</code> · 14.6 MB · captured 2026-06-04
              </td>
            </tr>
          </tbody>
        </table>
      </ModalSection>

      <ModalSection heading="Coverage">
        <table className="info-table">
          <tbody>
            <tr>
              <td>Place of Service codes</td>
              <td>50</td>
            </tr>
            <tr>
              <td>HCPCS Level II modifiers</td>
              <td>47</td>
            </tr>
            <tr>
              <td>MS-DRGs (all w/ FY 2026 weights)</td>
              <td>770</td>
            </tr>
            <tr>
              <td>MDC categories</td>
              <td>26</td>
            </tr>
            <tr>
              <td>CC / MCC ICD-10 classifications</td>
              <td>18,432</td>
            </tr>
            <tr>
              <td>ICD → DRG principal-dx routings</td>
              <td>213,321</td>
            </tr>
            <tr>
              <td>Billing topics</td>
              <td>8</td>
            </tr>
            <tr>
              <td>FTS5 indexes</td>
              <td>3 (pos_fts / modifier_fts / drg_fts)</td>
            </tr>
          </tbody>
        </table>
      </ModalSection>

      <ModalSection heading="What's Included">
        <ul>
          <li>Full MS-DRG triplets with severity (With MCC / With CC / Without CC/MCC)</li>
          <li>FY 2026 relative weights, GMLOS, AMLOS for every DRG</li>
          <li>CC/MCC classifications per ICD-10 (Appendix G + Appendix H)</li>
          <li>Principal-diagnosis routing including cross-MDC variants (e.g. neonate)</li>
          <li>Full-text indexes (FTS5) on POS / Modifier / DRG names + descriptions</li>
          <li>Abbreviation dictionary — 171 entries spanning billing + clinical vocab</li>
        </ul>
      </ModalSection>

      <ModalSection heading="What's Not Included">
        <ul>
          <li>
            <strong>AMA CPT codes</strong> — Level I HCPCS. Not public domain;
            excluded by design.
          </li>
          <li>
            <strong>The official CMS Grouper</strong> — MedBill Snap models the
            principal-dx routing table but is not the binding IPPS Grouper.
          </li>
          <li>
            <strong>Procedure-driven DRGs without principal-dx anchors</strong>{" "}
            (transplants, ECMO) — these have no ICD entry in the routing table.
          </li>
          <li>
            <strong>Real-time CMS updates</strong> — bundled snapshot, refreshed
            with the next FY cycle.
          </li>
          <li>
            <strong>Carrier-specific edits / NCDs / LCDs</strong> — outside the
            CMS Definitions Manual scope.
          </li>
        </ul>
      </ModalSection>

      <ModalSection heading="Update Cadence">
        <p>
          Bundled database is refreshed <strong>semi-annually</strong> to
          match CMS's fiscal-year cycle: <strong>Oct 1</strong> (FY change —
          MS-DRG weights, new MS-DRGs) and <strong>Apr 1</strong> (minor
          adjustments). The next planned refresh is <strong>2026-10-01</strong>{" "}
          (FY 2027). Out-of-band refreshes happen for CMS-published Final
          Rule errata.
        </p>
      </ModalSection>

      <ModalSection heading="Licence — CMS Public Domain">
        <p className="info-modal__ogl">
          U.S. federal government public-domain sources. CMS Definitions
          Manual + IPPS Final Rule are not subject to copyright in the United
          States. MedBill Snap is not affiliated with CMS or any government
          agency. For binding classification, payment, or coverage decisions,
          consult CMS publications or a qualified medical coder. AMA CPT
          codes are excluded by design.
        </p>
      </ModalSection>
    </InfoModal>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoModal title="About MedBill Snap" onClose={onClose}>
      <div className="info-modal__app-header">
        <div className="info-modal__app-name">MedBill Snap</div>
        <div className="info-modal__app-version">Version 1.0.0</div>
        <div className="info-modal__app-tagline">
          POS · HCPCS Modifier · MS-DRG · ICD→DRG — offline reference for
          U.S. medical billers and coders.
        </div>
      </div>

      <ModalSection heading="Why This App">
        <p>
          Coders and billers reach for the CMS Definitions Manual, the IPPS
          Final Rule, and Appendix G / H every day — but the manuals are
          PDFs, the official Grouper is online-only, and there's no fast way
          to ask "what does this principal ICD route to, and what does adding
          this CC do to the weight?"
        </p>
        <p>
          MedBill Snap is that fast way. 14.6 MB of bundled CMS data, four
          search surfaces unified under one shell, and a CC/MCC Impact
          Calculator that does the routing math for you. Works offline by
          default — your internet can drop and the app keeps responding.
        </p>
      </ModalSection>

      <ModalSection heading="Free for Everyone">
        <p>
          MedBill Snap is free to use. Every search, calculator computation,
          favorite, and collection is unlocked by default — no ads, no
          subscription, no account required.
        </p>
        <p>
          A one-time premium licence unlocks all four premium themes and
          removes the free-plan limits ({FREE_FAVORITES_MAX} favorites /{" "}
          {FREE_COLLECTIONS_MAX} collections). It's a way to support
          continued data updates if the app saves you time.
        </p>
      </ModalSection>

      <ModalSection heading="Data Source">
        <p>
          All coding data comes from <strong>CMS public-domain</strong>{" "}
          sources: the MS-DRG Definitions Manual v43.0 + the IPPS FY 2026
          Final Rule Table 5 + the CMS POS code set + HCPCS Level II
          alpha-numeric modifiers. AMA CPT codes are explicitly excluded.
        </p>
        <p className="info-modal__ogl">
          U.S. federal government public-domain references. MedBill Snap is
          not affiliated with CMS or any government agency. Always verify
          final classification, weight, and routing with the official CMS
          IPPS Grouper or a qualified medical coder before billing.
        </p>
      </ModalSection>

      <ModalSection heading="Privacy">
        <p>
          All data stays on your computer. MedBill Snap does not collect,
          transmit, or share any personal information. The only network
          request is an optional licence-key activation check with Lemon
          Squeezy (our payment processor) when you enter a premium key.
        </p>
      </ModalSection>

      <ModalSection heading="Disclaimer">
        <p>
          MedBill Snap is a reference and educational tool. Classification,
          DRG routing, severity attribution, and payment determinations are
          binding acts under the IPPS regulations. The CC/MCC Impact
          Calculator approximates the principal-diagnosis routing table —
          it is not the official CMS Grouper. Always verify final coding
          and payment with CMS publications or a qualified medical coder
          before submitting a claim.
        </p>
      </ModalSection>

      <ModalSection heading="Open Source">
        <div className="info-modal__oss-row">
          <strong>rusqlite</strong>
          <span>SQLite bindings for Rust. MIT License.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>printpdf</strong>
          <span>PDF generation for Rust. MIT License.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>NanumGothic</strong>
          <span>Embedded CJK font for PDF export. SIL OFL 1.1.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>React</strong>
          <span>UI framework by Meta. MIT License.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>Tauri</strong>
          <span>Desktop app framework. MIT / Apache 2.0.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>cmdk</strong>
          <span>Command palette by Vercel. MIT License.</span>
        </div>
        <div className="info-modal__oss-row">
          <strong>Inter / Atkinson Hyperlegible</strong>
          <span>UI fonts. OFL 1.1.</span>
        </div>
      </ModalSection>
    </InfoModal>
  );
}

function ThemeCard({
  theme,
  selected,
  locked,
  onClick,
}: {
  theme: Theme;
  selected: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const [bg, accent] = SWATCH[theme];
  return (
    <button
      className={`theme-card${selected ? " theme-card--selected" : ""}${
        locked ? " theme-card--locked" : ""
      }`}
      onClick={onClick}
    >
      <span className="theme-swatch" style={{ background: bg }}>
        <span className="theme-swatch__dot" style={{ background: accent }} />
        {locked && <span className="theme-swatch__lock">🔒</span>}
      </span>
      <span className="theme-card__label">{THEME_LABELS[theme]}</span>
      {selected && <span className="theme-card__check">✓</span>}
    </button>
  );
}

function PremiumSection({
  unlocked,
  licenseKey,
  activateLicense,
  deactivateLicense,
  togglePremiumOverride,
}: {
  unlocked: boolean;
  licenseKey: string | null;
  activateLicense: (key: string) => Promise<void>;
  deactivateLicense: () => Promise<void>;
  togglePremiumOverride: () => Promise<void>;
}) {
  const { favorites, collections } = useAppData();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await activateLicense(key);
      setKey("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!window.confirm("Deactivate premium on this computer?")) return;
    setBusy(true);
    setError(null);
    try {
      await deactivateLicense();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <h2 className="settings-heading">Premium</h2>
      {unlocked ? (
        <div className="premium-box premium-box--on">
          <p className="premium-box__title">✓ Premium unlocked</p>
          <p className="premium-box__text">
            Thank you for supporting MedBill Snap.
          </p>
          {licenseKey && (
            <p className="premium-box__key">Key: {maskKey(licenseKey)}</p>
          )}
          <button className="btn" onClick={deactivate} disabled={busy}>
            Deactivate on this computer
          </button>
        </div>
      ) : (
        <div className="premium-box">
          <p className="premium-box__text">
            MedBill Snap is free to use. A one-time premium license unlocks all
            four premium themes plus unlimited favorites and collections.
          </p>
          <p className="premium-box__text">
            Free plan: {favorites.length} / {FREE_FAVORITES_MAX} favorites
            {" · "}
            {collections.length} / {FREE_COLLECTIONS_MAX} collections. Notes,
            the calculator, and DRG browser are always unlimited.
          </p>
          <p className="premium-box__text">
            Enter your license key (one key works on up to 2 computers):
          </p>
          <div className="license-row">
            <input
              className="text-input"
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              disabled={busy}
            />
            <button
              className="btn btn--primary"
              onClick={activate}
              disabled={busy || !key.trim()}
            >
              {busy ? "Activating…" : "Activate"}
            </button>
          </div>
          {error && <p className="license-error">{error}</p>}
        </div>
      )}
      {isDev && (
        <button
          className="btn dev-btn"
          onClick={() => togglePremiumOverride()}
        >
          Dev: toggle premium override
        </button>
      )}
    </section>
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span className="info-row__value">{value}</span>
    </div>
  );
}
