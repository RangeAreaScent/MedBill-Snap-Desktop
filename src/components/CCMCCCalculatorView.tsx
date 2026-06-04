import { useEffect, useState } from "react";
import { classifyIcd, computeImpact } from "../api";
import type {
  CcMccEntry,
  CcMccLevel,
  ImpactResult,
  LibraryItem,
} from "../types";

interface Props {
  onOpenDrg?: (item: LibraryItem) => void;
}

const LEVEL_LABEL: Record<CcMccLevel, string> = {
  mcc: "MCC",
  cc: "CC",
  none: "none",
};

export function CCMCCCalculatorView({ onOpenDrg }: Props) {
  const [principalInput, setPrincipalInput] = useState("");
  const [secondaryInput, setSecondaryInput] = useState("");
  const [principal, setPrincipal] = useState<string>("");
  const [secondaries, setSecondaries] = useState<string[]>([]);
  const [secondaryClassifications, setSecondaryClassifications] = useState<
    CcMccEntry[]
  >([]);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recompute impact whenever the principal or secondary list changes.
  useEffect(() => {
    if (!principal.trim()) {
      setImpact(null);
      setSecondaryClassifications([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    computeImpact(principal, secondaries)
      .then((r) => {
        setImpact(r);
        setSecondaryClassifications(r.secondaryClassifications);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [principal, secondaries]);

  function commitPrincipal() {
    const v = principalInput.trim().toUpperCase();
    setPrincipal(v);
  }

  async function addSecondary() {
    const v = secondaryInput.trim().toUpperCase();
    if (!v || secondaries.includes(v)) return;
    setSecondaries((prev) => [...prev, v]);
    setSecondaryInput("");
    // Eager classify for instant chip render even before recompute completes.
    try {
      const c = await classifyIcd(v);
      setSecondaryClassifications((prev) =>
        prev.some((e) => e.icdCode === c.icdCode) ? prev : [...prev, c],
      );
    } catch {
      /* the recompute call will surface errors */
    }
  }

  function removeSecondary(icd: string) {
    setSecondaries((prev) => prev.filter((s) => s !== icd));
    setSecondaryClassifications((prev) =>
      prev.filter((e) => e.icdCode !== icd),
    );
  }

  return (
    <div className="calc-view">
      <header className="calc-head">
        <h2>CC/MCC Impact Calculator</h2>
        <p className="calc-sub">
          Enter a principal ICD-10 + secondary diagnoses to see the routed
          DRG and the relative-weight delta vs the without-CC/MCC baseline.
        </p>
      </header>

      <section className="calc-section">
        <label className="field-label">Principal ICD-10</label>
        <div className="calc-row">
          <input
            className="text-input"
            placeholder="e.g. I50.9"
            value={principalInput}
            onChange={(e) => setPrincipalInput(e.target.value)}
            onBlur={commitPrincipal}
            onKeyDown={(e) => e.key === "Enter" && commitPrincipal()}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn btn--primary" onClick={commitPrincipal}>
            Set
          </button>
        </div>
        {principal && (
          <div className="calc-principal-chip">
            Principal: <strong>{principal}</strong>
          </div>
        )}
      </section>

      <section className="calc-section">
        <label className="field-label">Secondary diagnoses</label>
        <div className="calc-row">
          <input
            className="text-input"
            placeholder="e.g. N17.9 (AKI)"
            value={secondaryInput}
            onChange={(e) => setSecondaryInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSecondary()}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn" onClick={addSecondary}>
            + Add
          </button>
        </div>
        <ul className="pill-list">
          {secondaries.map((s) => {
            const cls = secondaryClassifications.find((e) => e.icdCode === s);
            return (
              <li key={s} className={`pill pill--${cls?.level ?? "none"}`}>
                <span className="pill__code">{s}</span>
                {cls && (
                  <span className="pill__level">{LEVEL_LABEL[cls.level]}</span>
                )}
                <button
                  className="pill__remove"
                  onClick={() => removeSecondary(s)}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            );
          })}
          {secondaries.length === 0 && (
            <li className="pill-list__empty">
              No secondaries — baseline = principal alone.
            </li>
          )}
        </ul>
      </section>

      {loading && <div className="status">Computing…</div>}
      {error && <div className="status error">Error: {error}</div>}

      {impact && impact.candidateDrgs.length === 0 && !loading && (
        <div className="state-msg">
          <p className="state-msg__title">No DRG routing found for {impact.principalIcd}</p>
          <p>
            This ICD doesn't appear in the principal-diagnosis routing table.
            Procedure-driven DRGs (transplants, ECMO) are not in this lookup.
          </p>
        </div>
      )}

      {impact && impact.candidateDrgs.length > 0 && (
        <section className="calc-result">
          <header className="calc-result__head">
            <span>
              Highest secondary level:&nbsp;
              <strong className={`level-${impact.highestSecondaryLevel}`}>
                {LEVEL_LABEL[impact.highestSecondaryLevel]}
              </strong>
            </span>
            {impact.routedDrg && (
              <span>
                Routed → <strong>DRG {impact.routedDrg.number}</strong>
                {impact.routedDrg.severity ? ` (${impact.routedDrg.severity})` : ""}
              </span>
            )}
          </header>

          {impact.baselineDrg && impact.routedDrg && impact.weightDelta != null && (
            <div className="weight-delta">
              <span>Baseline {impact.baselineDrg.relativeWeight?.toFixed(4) ?? "—"}</span>
              <span className="arrow">→</span>
              <span>Routed {impact.routedDrg.relativeWeight?.toFixed(4) ?? "—"}</span>
              <span
                className={`delta delta--${impact.weightDelta >= 0 ? "pos" : "neg"}`}
              >
                Δ {impact.weightDelta >= 0 ? "+" : ""}
                {impact.weightDelta.toFixed(4)}
              </span>
            </div>
          )}

          <h4 className="calc-candidates__title">Candidate DRGs</h4>
          <ul className="calc-candidates">
            {impact.candidateDrgs.map((c) => (
              <li
                key={c.number}
                className={`calc-candidate${impact.routedDrg?.number === c.number ? " calc-candidate--routed" : ""}`}
              >
                <span className="code-chip code-chip--drg">DRG</span>
                <span className="num">{c.number}</span>
                <span className="name">{c.name}</span>
                {c.severity && (
                  <span className={`sev sev--${severityClass(c.severity)}`}>
                    {c.severity}
                  </span>
                )}
                {c.relativeWeight != null && (
                  <span className="wt">Wt {c.relativeWeight.toFixed(4)}</span>
                )}
                {c.mdcCode && <span className="mdc">MDC {c.mdcCode}</span>}
                {onOpenDrg && (
                  <button
                    className="btn btn--small"
                    onClick={() =>
                      onOpenDrg({
                        key: `drg:${c.number}`,
                        kind: "drg",
                        displayCode: c.number,
                        name: c.name,
                        description: c.name,
                      })
                    }
                  >
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>

          <p className="calc-disclaimer">
            Reference only — not the official CMS Grouper. Routing assumes the
            principal-dx routing table; procedure-driven DRGs are out of scope.
          </p>
        </section>
      )}
    </div>
  );
}

function severityClass(s: string): string {
  if (s.includes("MCC")) return "mcc";
  if (s.includes("CC")) return "cc";
  return "none";
}
