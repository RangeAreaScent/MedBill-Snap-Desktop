//! Read-only access to the bundled MedBill SQLite database.
//!
//! Domain tables exposed:
//!   * `pos_codes`        + `pos_fts`      — 50 Place of Service codes
//!   * `hcpcs_modifiers`  + `modifier_fts` — 47 HCPCS Level II modifiers
//!   * `ms_drgs`          + `drg_fts`      — 770 MS-DRGs (FY 2026)
//!   * `mdc_categories`                    — 26 Major Diagnostic Categories
//!   * `cc_mcc_list`                       — 18,432 ICD-10 CC/MCC classifications
//!   * `drg_icd_mapping`                   — 213,321 principal-dx → DRG routings
//!   * `billing_topics`                    — 8 quick-reference topics
//!
//! Each command opens its own read-only connection (cheap — just a file
//! handle), so concurrent lookups never contend on a shared mutex.

use crate::abbreviations;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

// =====================================================================
// Search models
// =====================================================================

/// Discriminated union — one shape over all four search modes.
#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SearchResult {
    #[serde(rename = "pos")]
    Pos {
        code: String,
        name: String,
        description: String,
    },
    #[serde(rename = "modifier")]
    Modifier {
        code: String,
        name: String,
        description: String,
        category: Option<String>,
    },
    #[serde(rename = "drg")]
    Drg {
        number: String,
        name: String,
        mdc_code: Option<String>,
        drg_type: Option<String>,
        severity: Option<String>,
        relative_weight: Option<f64>,
    },
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PosDetail {
    pub code: String,
    pub name: String,
    pub description: String,
    pub notes: Option<String>,
    pub effective_date: Option<String>,
    pub last_updated: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierDetail {
    pub code: String,
    pub name: String,
    pub description: String,
    pub usage_example: Option<String>,
    pub billing_impact: Option<String>,
    pub category: Option<String>,
    pub effective_year: Option<i64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DrgDetail {
    pub number: String,
    pub name: String,
    pub mdc_code: Option<String>,
    pub mdc_name: Option<String>,
    pub drg_type: Option<String>,
    pub severity: Option<String>,
    pub relative_weight: Option<f64>,
    pub geometric_mean_los: Option<f64>,
    pub arithmetic_mean_los: Option<f64>,
    pub effective_fy: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MdcCategory {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub drg_count: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BillingTopic {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub related_codes: Vec<String>,
}

// =====================================================================
// CC/MCC + impact models
// =====================================================================

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum CcMccLevel {
    Mcc,
    Cc,
    None,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CcMccEntry {
    pub icd_code: String,
    pub level: CcMccLevel,
    pub description: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImpactCandidate {
    pub number: String,
    pub name: String,
    pub mdc_code: Option<String>,
    pub drg_type: Option<String>,
    pub severity: Option<String>,
    pub relative_weight: Option<f64>,
    pub geometric_mean_los: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImpactResult {
    pub principal_icd: String,
    pub highest_secondary_level: CcMccLevel,
    pub secondary_classifications: Vec<CcMccEntry>,
    pub candidate_drgs: Vec<ImpactCandidate>,
    pub baseline_drg: Option<ImpactCandidate>,
    pub routed_drg: Option<ImpactCandidate>,
    pub weight_delta: Option<f64>,
}

// =====================================================================
// Connection + FTS helpers
// =====================================================================

fn open(db_path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("failed to open MedBill database: {e}"))
}

/// Builds an injection-safe FTS5 MATCH expression: alphanumeric tokens of
/// length >= 2, each wrapped as a quoted prefix term, joined by space (AND).
fn make_fts_query(expanded: &str) -> String {
    expanded
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.chars().count() >= 2)
        .map(|t| format!("\"{t}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// ICD-10 normalization. Strips spaces, uppercases. We DO NOT touch the
/// dotted/dotless form — the database stores codes in canonical dotted form
/// where applicable; 3-char category codes are stored unchanged. Callers
/// pass the user's input; we look up as-is after normalization.
fn normalize_icd(input: &str) -> String {
    input.trim().to_uppercase().replace(' ', "")
}

// =====================================================================
// POS search + detail
// =====================================================================

pub fn search_pos(
    db_path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open(db_path)?;
    let expanded = abbreviations::expand(trimmed);
    let fts_query = make_fts_query(&expanded);
    let code_prefix = format!("{}%", trimmed);

    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<SearchResult> = Vec::with_capacity(limit);

    // Code prefix
    {
        let mut stmt = conn
            .prepare(
                "SELECT pos_code, name, description \
                 FROM pos_codes WHERE pos_code LIKE ?1 \
                 ORDER BY pos_code LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![code_prefix, limit.min(20) as i64], |r| {
                Ok(SearchResult::Pos {
                    code: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    description: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Pos { ref code, .. } = r {
                if seen.insert(code.clone()) {
                    out.push(r);
                }
            }
        }
    }

    // FTS
    if !fts_query.is_empty() && out.len() < limit {
        let mut stmt = conn
            .prepare(
                "SELECT p.pos_code, p.name, p.description \
                 FROM pos_fts f JOIN pos_codes p ON f.rowid = p.rowid \
                 WHERE pos_fts MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![fts_query, limit.max(50) as i64], |r| {
                Ok(SearchResult::Pos {
                    code: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    description: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Pos { ref code, .. } = r {
                if seen.insert(code.clone()) {
                    out.push(r);
                    if out.len() >= limit {
                        break;
                    }
                }
            }
        }
    }

    Ok(out)
}

pub fn fetch_pos(db_path: &Path, code: &str) -> Result<Option<PosDetail>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT pos_code, name, description, notes, effective_date, last_updated \
             FROM pos_codes WHERE pos_code = ?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![code.trim()], |r| {
            Ok(PosDetail {
                code: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                description: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                notes: r.get(3)?,
                effective_date: r.get(4)?,
                last_updated: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

// =====================================================================
// Modifier search + detail
// =====================================================================

pub fn search_modifiers(
    db_path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let conn = open(db_path)?;
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return list_modifiers(&conn, limit.max(100));
    }

    let mod_prefix = format!("{}%", trimmed.to_uppercase());
    let expanded = abbreviations::expand(trimmed);
    let fts_query = make_fts_query(&expanded);

    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<SearchResult> = Vec::with_capacity(limit);

    {
        let mut stmt = conn
            .prepare(
                "SELECT modifier_code, name, description, category \
                 FROM hcpcs_modifiers WHERE modifier_code LIKE ?1 \
                 ORDER BY modifier_code LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![mod_prefix, limit.min(20) as i64], map_mod_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Modifier { ref code, .. } = r {
                if seen.insert(code.clone()) {
                    out.push(r);
                }
            }
        }
    }

    if !fts_query.is_empty() && out.len() < limit {
        let mut stmt = conn
            .prepare(
                "SELECT m.modifier_code, m.name, m.description, m.category \
                 FROM modifier_fts f JOIN hcpcs_modifiers m ON f.rowid = m.rowid \
                 WHERE modifier_fts MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![fts_query, limit.max(50) as i64], map_mod_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Modifier { ref code, .. } = r {
                if seen.insert(code.clone()) {
                    out.push(r);
                    if out.len() >= limit {
                        break;
                    }
                }
            }
        }
    }

    Ok(out)
}

fn list_modifiers(conn: &Connection, limit: usize) -> Result<Vec<SearchResult>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT modifier_code, name, description, category \
             FROM hcpcs_modifiers ORDER BY modifier_code LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![limit as i64], map_mod_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn map_mod_row(r: &rusqlite::Row) -> rusqlite::Result<SearchResult> {
    Ok(SearchResult::Modifier {
        code: r.get(0)?,
        name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
        description: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
        category: r.get(3)?,
    })
}

pub fn fetch_modifier(db_path: &Path, code: &str) -> Result<Option<ModifierDetail>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT modifier_code, name, description, usage_example, billing_impact, \
             category, effective_year \
             FROM hcpcs_modifiers WHERE modifier_code = ?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![code.trim().to_uppercase()], |r| {
            Ok(ModifierDetail {
                code: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                description: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                usage_example: r.get(3)?,
                billing_impact: r.get(4)?,
                category: r.get(5)?,
                effective_year: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

// =====================================================================
// DRG search + detail
// =====================================================================

pub fn search_drgs(
    db_path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open(db_path)?;
    let expanded = abbreviations::expand(trimmed);
    let fts_query = make_fts_query(&expanded);
    let num_prefix = format!("{}%", trimmed);

    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<SearchResult> = Vec::with_capacity(limit);

    // Number prefix (zero-padded form: '291', '470')
    {
        let mut stmt = conn
            .prepare(
                "SELECT drg_number, drg_name, mdc_code, drg_type, severity, relative_weight \
                 FROM ms_drgs WHERE drg_number LIKE ?1 \
                 ORDER BY drg_number LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![num_prefix, limit.min(20) as i64], map_drg_search_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Drg { ref number, .. } = r {
                if seen.insert(number.clone()) {
                    out.push(r);
                }
            }
        }
    }

    if !fts_query.is_empty() && out.len() < limit {
        let mut stmt = conn
            .prepare(
                "SELECT d.drg_number, d.drg_name, d.mdc_code, d.drg_type, d.severity, d.relative_weight \
                 FROM drg_fts f JOIN ms_drgs d ON f.rowid = d.rowid \
                 WHERE drg_fts MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![fts_query, limit.max(50) as i64], map_drg_search_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            let r = row.map_err(|e| e.to_string())?;
            if let SearchResult::Drg { ref number, .. } = r {
                if seen.insert(number.clone()) {
                    out.push(r);
                    if out.len() >= limit {
                        break;
                    }
                }
            }
        }
    }

    Ok(out)
}

fn map_drg_search_row(r: &rusqlite::Row) -> rusqlite::Result<SearchResult> {
    Ok(SearchResult::Drg {
        number: r.get(0)?,
        name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
        mdc_code: r.get(2)?,
        drg_type: r.get(3)?,
        severity: r.get(4)?,
        relative_weight: r.get(5)?,
    })
}

pub fn fetch_drg(db_path: &Path, number: &str) -> Result<Option<DrgDetail>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT d.drg_number, d.drg_name, d.mdc_code, c.mdc_name, \
             d.drg_type, d.severity, d.relative_weight, d.geometric_mean_los, \
             d.arithmetic_mean_los, d.effective_fy, d.notes \
             FROM ms_drgs d LEFT JOIN mdc_categories c ON d.mdc_code = c.mdc_code \
             WHERE d.drg_number = ?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![number.trim()], |r| {
            Ok(DrgDetail {
                number: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                mdc_code: r.get(2)?,
                mdc_name: r.get(3)?,
                drg_type: r.get(4)?,
                severity: r.get(5)?,
                relative_weight: r.get(6)?,
                geometric_mean_los: r.get(7)?,
                arithmetic_mean_los: r.get(8)?,
                effective_fy: r.get(9)?,
                notes: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

// =====================================================================
// ICD → DRG reverse routing
// =====================================================================

pub fn search_drgs_by_icd(
    db_path: &Path,
    icd: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let normalized = normalize_icd(icd);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open(db_path)?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT d.drg_number, d.drg_name, d.mdc_code, d.drg_type, \
             d.severity, d.relative_weight \
             FROM drg_icd_mapping m \
             JOIN ms_drgs d ON m.drg_number = d.drg_number \
             WHERE m.icd_code = ?1 \
             ORDER BY \
               CASE d.severity \
                 WHEN 'With MCC' THEN 0 \
                 WHEN 'With CC'  THEN 1 \
                 WHEN 'Without CC/MCC' THEN 2 \
                 ELSE 3 END, \
               d.drg_number \
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![normalized, limit as i64], map_drg_search_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// =====================================================================
// CC/MCC classify + impact
// =====================================================================

pub fn classify_icd(db_path: &Path, icd: &str) -> Result<CcMccEntry, String> {
    let normalized = normalize_icd(icd);
    if normalized.is_empty() {
        return Ok(CcMccEntry {
            icd_code: String::new(),
            level: CcMccLevel::None,
            description: None,
        });
    }
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT cc_mcc_level, description FROM cc_mcc_list \
             WHERE icd10_code = ?1 LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![normalized], |r| {
            let level_str: String = r.get(0)?;
            let level = match level_str.as_str() {
                "MCC" => CcMccLevel::Mcc,
                "CC" => CcMccLevel::Cc,
                _ => CcMccLevel::None,
            };
            let desc: Option<String> = r.get(1)?;
            Ok((level, desc))
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => {
            let (level, description) = r.map_err(|e| e.to_string())?;
            Ok(CcMccEntry {
                icd_code: normalized,
                level,
                description,
            })
        }
        None => Ok(CcMccEntry {
            icd_code: normalized,
            level: CcMccLevel::None,
            description: None,
        }),
    }
}

pub fn compute_impact(
    db_path: &Path,
    principal_icd: &str,
    secondary_icds: &[String],
) -> Result<ImpactResult, String> {
    let principal = normalize_icd(principal_icd);
    let secondary_classifications: Vec<CcMccEntry> = secondary_icds
        .iter()
        .map(|s| classify_icd(db_path, s))
        .collect::<Result<Vec<_>, _>>()?;

    let highest = secondary_classifications
        .iter()
        .map(|e| e.level)
        .fold(CcMccLevel::None, |acc, l| match (acc, l) {
            (CcMccLevel::Mcc, _) | (_, CcMccLevel::Mcc) => CcMccLevel::Mcc,
            (CcMccLevel::Cc, _) | (_, CcMccLevel::Cc) => CcMccLevel::Cc,
            _ => CcMccLevel::None,
        });

    if principal.is_empty() {
        return Ok(ImpactResult {
            principal_icd: principal,
            highest_secondary_level: highest,
            secondary_classifications,
            candidate_drgs: Vec::new(),
            baseline_drg: None,
            routed_drg: None,
            weight_delta: None,
        });
    }

    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT d.drg_number, d.drg_name, d.mdc_code, d.drg_type, \
             d.severity, d.relative_weight, d.geometric_mean_los \
             FROM drg_icd_mapping m \
             JOIN ms_drgs d ON m.drg_number = d.drg_number \
             WHERE m.icd_code = ?1 \
             ORDER BY \
               CASE d.severity \
                 WHEN 'With MCC' THEN 0 \
                 WHEN 'With CC'  THEN 1 \
                 WHEN 'Without CC/MCC' THEN 2 \
                 ELSE 3 END, \
               d.drg_number",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![principal], |r| {
            Ok(ImpactCandidate {
                number: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                mdc_code: r.get(2)?,
                drg_type: r.get(3)?,
                severity: r.get(4)?,
                relative_weight: r.get(5)?,
                geometric_mean_los: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let candidates: Vec<ImpactCandidate> =
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    let baseline = candidates
        .iter()
        .find(|c| c.severity.as_deref() == Some("Without CC/MCC"))
        .cloned()
        .or_else(|| candidates.first().cloned());

    let routed = match highest {
        CcMccLevel::Mcc => candidates
            .iter()
            .find(|c| c.severity.as_deref() == Some("With MCC"))
            .cloned(),
        CcMccLevel::Cc => candidates
            .iter()
            .find(|c| c.severity.as_deref() == Some("With CC"))
            .cloned(),
        CcMccLevel::None => candidates
            .iter()
            .find(|c| c.severity.as_deref() == Some("Without CC/MCC"))
            .cloned(),
    }
    .or_else(|| baseline.clone());

    let weight_delta = match (routed.as_ref(), baseline.as_ref()) {
        (Some(r), Some(b)) => match (r.relative_weight, b.relative_weight) {
            (Some(rw), Some(bw)) => Some(rw - bw),
            _ => None,
        },
        _ => None,
    };

    Ok(ImpactResult {
        principal_icd: principal,
        highest_secondary_level: highest,
        secondary_classifications,
        candidate_drgs: candidates,
        baseline_drg: baseline,
        routed_drg: routed,
        weight_delta,
    })
}

// =====================================================================
// MDC browser
// =====================================================================

pub fn list_mdcs(db_path: &Path) -> Result<Vec<MdcCategory>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT c.mdc_code, c.mdc_name, c.description, \
                    (SELECT COUNT(*) FROM ms_drgs d WHERE d.mdc_code = c.mdc_code) AS drg_count \
             FROM mdc_categories c ORDER BY c.mdc_code",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(MdcCategory {
                code: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                description: r.get(2)?,
                drg_count: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn list_drgs_by_mdc(db_path: &Path, mdc_code: &str) -> Result<Vec<SearchResult>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT drg_number, drg_name, mdc_code, drg_type, severity, relative_weight \
             FROM ms_drgs WHERE mdc_code = ?1 ORDER BY drg_number",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![mdc_code.trim()], map_drg_search_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// =====================================================================
// Billing topics
// =====================================================================

pub fn list_topics(db_path: &Path) -> Result<Vec<BillingTopic>, String> {
    let conn = open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT topic_slug, topic_name, description, related_codes \
             FROM billing_topics ORDER BY topic_name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let csv: Option<String> = r.get(3)?;
            let related = csv
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(BillingTopic {
                slug: r.get(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                description: r.get(2)?,
                related_codes: related,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// =====================================================================
// Tests
// =====================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/medbill_v1.sqlite")
    }

    #[test]
    fn pos_prefix_finds_office() {
        let out = search_pos(&db(), "11", 10).unwrap();
        assert!(out.iter().any(|r| matches!(r, SearchResult::Pos { code, .. } if code == "11")));
    }

    #[test]
    fn drg_fts_finds_heart_failure_triplet() {
        let out = search_drgs(&db(), "heart failure", 10).unwrap();
        let nums: Vec<String> = out
            .iter()
            .filter_map(|r| match r {
                SearchResult::Drg { number, .. } => Some(number.clone()),
                _ => None,
            })
            .collect();
        assert!(nums.contains(&"291".to_string()));
        assert!(nums.contains(&"292".to_string()));
        assert!(nums.contains(&"293".to_string()));
    }

    #[test]
    fn icd_to_drg_i509_routes_to_triplet() {
        let out = search_drgs_by_icd(&db(), "I50.9", 10).unwrap();
        let nums: Vec<String> = out
            .iter()
            .filter_map(|r| match r {
                SearchResult::Drg { number, .. } => Some(number.clone()),
                _ => None,
            })
            .collect();
        assert!(nums.contains(&"291".to_string()));
        assert!(nums.contains(&"292".to_string()));
        assert!(nums.contains(&"293".to_string()));
    }

    #[test]
    fn classify_n179_is_cc() {
        let e = classify_icd(&db(), "N17.9").unwrap();
        assert_eq!(e.level, CcMccLevel::Cc);
    }

    #[test]
    fn impact_i509_with_n179_routes_with_cc() {
        let r = compute_impact(&db(), "I50.9", &["N17.9".to_string()]).unwrap();
        assert_eq!(r.highest_secondary_level, CcMccLevel::Cc);
        assert!(r.routed_drg.is_some());
        let routed = r.routed_drg.unwrap();
        assert_eq!(routed.severity.as_deref(), Some("With CC"));
        assert_eq!(routed.number, "292");
    }

    #[test]
    fn mdc_list_contains_26() {
        let mdcs = list_mdcs(&db()).unwrap();
        assert_eq!(mdcs.len(), 26);
    }

    #[test]
    fn topics_list_contains_8() {
        let t = list_topics(&db()).unwrap();
        assert_eq!(t.len(), 8);
    }
}

/// Real-user search scenarios — partial numbers, abbreviations, common
/// disease names, format variants, edge cases. Run with `--nocapture` to
/// see what the search actually returns:
///   cargo test --lib realistic -- --nocapture
#[cfg(test)]
mod realistic_search_scenarios {
    use super::*;
    use std::path::PathBuf;

    fn db() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/medbill_v1.sqlite")
    }

    // ---------- helpers — print top results so a human can eyeball ----------

    fn print_header(scenario: &str, query: &str, mode: &str) {
        println!(
            "\n──── {scenario:<55} [{mode}] q={query:?}",
            scenario = scenario,
            mode = mode,
            query = query,
        );
    }

    fn print_results(results: &[SearchResult], cap: usize) {
        if results.is_empty() {
            println!("    (no results)");
            return;
        }
        for r in results.iter().take(cap) {
            match r {
                SearchResult::Pos { code, name, .. } => {
                    println!("    POS {code:<4} {name}", code = code, name = name);
                }
                SearchResult::Modifier {
                    code,
                    name,
                    category,
                    ..
                } => {
                    println!(
                        "    MOD {code:<4} {name}  [{cat}]",
                        code = code,
                        name = name,
                        cat = category.as_deref().unwrap_or("-"),
                    );
                }
                SearchResult::Drg {
                    number,
                    name,
                    severity,
                    relative_weight,
                    ..
                } => {
                    println!(
                        "    DRG {n:<4} {name:<60.60}  {sev:<16} {w}",
                        n = number,
                        name = name,
                        sev = severity.as_deref().unwrap_or("-"),
                        w = relative_weight
                            .map(|w| format!("Wt {:.4}", w))
                            .unwrap_or_else(|| "Wt —".into()),
                    );
                }
            }
        }
        if results.len() > cap {
            println!("    … (+{} more)", results.len() - cap);
        }
    }

    fn drg_numbers(results: &[SearchResult]) -> Vec<String> {
        results
            .iter()
            .filter_map(|r| match r {
                SearchResult::Drg { number, .. } => Some(number.clone()),
                _ => None,
            })
            .collect()
    }

    // =====================================================================
    // POS — Place of Service (50 codes)
    // =====================================================================

    #[test]
    fn pos_office_by_number_and_word() {
        let by_num = search_pos(&db(), "11", 5).unwrap();
        print_header("POS 11 by number", "11", "pos");
        print_results(&by_num, 5);
        assert!(by_num.iter().any(|r| matches!(r, SearchResult::Pos { code, .. } if code == "11")));

        let by_word = search_pos(&db(), "office", 5).unwrap();
        print_header("POS by word 'office'", "office", "pos");
        print_results(&by_word, 5);
        assert!(by_word.iter().any(|r| matches!(r, SearchResult::Pos { code, .. } if code == "11")));
    }

    #[test]
    fn pos_single_digit_prefix_matches_two_digit_codes() {
        // User types "1" — they probably want POS 10–19 or POS 01.
        let r = search_pos(&db(), "1", 50).unwrap();
        print_header("POS single-digit '1' prefix", "1", "pos");
        print_results(&r, 12);
        // Should find at least 11 (Office) and 12 (Home).
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Pos { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"11".to_string()), "expected '11' in: {codes:?}");
        assert!(codes.contains(&"12".to_string()), "expected '12' in: {codes:?}");
    }

    #[test]
    fn pos_emergency_inpatient_telehealth_keywords() {
        for (label, q, expect_code) in [
            ("emergency room", "emergency", "23"),
            ("inpatient hospital", "inpatient", "21"),
            ("ambulance", "ambulance", "41"), // 41 land, 42 air-water
            ("nursing facility", "nursing", "31"), // 31 SNF, 32 NF
        ] {
            let r = search_pos(&db(), q, 5).unwrap();
            print_header(label, q, "pos");
            print_results(&r, 5);
            let codes: Vec<_> = r
                .iter()
                .filter_map(|x| match x {
                    SearchResult::Pos { code, .. } => Some(code.clone()),
                    _ => None,
                })
                .collect();
            assert!(
                codes.contains(&expect_code.to_string()),
                "expected POS '{expect_code}' for query '{q}', got: {codes:?}"
            );
        }
    }

    #[test]
    fn pos_uppercase_query_works() {
        let r = search_pos(&db(), "HOME", 5).unwrap();
        print_header("uppercase 'HOME'", "HOME", "pos");
        print_results(&r, 5);
        assert!(!r.is_empty(), "uppercase 'HOME' should match POS 12 (Home)");
    }

    #[test]
    fn pos_empty_returns_nothing() {
        assert!(search_pos(&db(), "", 50).unwrap().is_empty());
        assert!(search_pos(&db(), "   ", 50).unwrap().is_empty());
    }

    #[test]
    fn pos_nonsense_returns_nothing() {
        let r = search_pos(&db(), "xyzqq", 50).unwrap();
        print_header("nonsense 'xyzqq'", "xyzqq", "pos");
        print_results(&r, 5);
        assert!(r.is_empty());
    }

    // =====================================================================
    // Modifiers — HCPCS Level II (47 modifiers)
    // =====================================================================

    #[test]
    fn modifier_letter_prefix_l_finds_lt_family() {
        let r = search_modifiers(&db(), "L", 30).unwrap();
        print_header("modifier prefix 'L'", "L", "modifier");
        print_results(&r, 12);
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Modifier { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"LT".to_string()), "expected LT in: {codes:?}");
    }

    #[test]
    fn modifier_bilateral_word_documents_data_gap() {
        // KNOWN DATA GAP (caught by realistic-search audit 2026-06-04):
        // CMS modifier 50 ("Bilateral Procedure" — the canonical bilateral
        // marker for paid surgeries) is NOT in the bundled dataset. The
        // 47-modifier seed list excluded it. LT/RT exist, but '50' and the
        // word "bilateral" both miss every row.
        // If this starts returning hits, the seed has been fixed — update
        // the assertion to verify modifier 50 is present.
        let r = search_modifiers(&db(), "bilateral", 5).unwrap();
        print_header("'bilateral' (DATA GAP — modifier 50 missing)", "bilateral", "modifier");
        print_results(&r, 5);
        assert!(
            r.is_empty(),
            "if 'bilateral' now returns hits, fix the seed → update this assertion"
        );
    }

    #[test]
    fn fts_ranking_observations_pos_office() {
        // UX OBSERVATION: typing "office" should naturally float POS 11
        // ("Office") to the top, but FTS5's BM25 ranks descriptions that
        // contain "office" multiple times above the bare-name match.
        // Documents current behavior; Phase D could weight name-matches
        // heavier than description-matches.
        let r = search_pos(&db(), "office", 10).unwrap();
        print_header(
            "FTS ranking: 'office' (POS 11 should ideally be first)",
            "office",
            "pos",
        );
        print_results(&r, 10);
        // Soft assertion: POS 11 appears SOMEWHERE in the top 10.
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Pos { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"11".to_string()), "POS 11 should at least be present");
        // Documented: as of 2026-06-04, POS 11 is NOT first — other codes
        // whose long descriptions mention "office" rank higher.
        let first_is_11 = codes.first().map(|c| c == "11").unwrap_or(false);
        if !first_is_11 {
            println!(
                "    ⚠ POS 11 not first — first match: {:?}",
                codes.first()
            );
        }
    }

    #[test]
    fn fts_ranking_observations_pos_home_matches_homeless_first() {
        // UX OBSERVATION: typing "home" returns POS 04 (Homeless Shelter)
        // before POS 12 (Home) because BM25 favors the longer description.
        // A smarter rank would prefer exact name-token matches.
        let r = search_pos(&db(), "home", 10).unwrap();
        print_header(
            "FTS ranking: 'home' (POS 12 = Home should rank above POS 04 Homeless)",
            "home",
            "pos",
        );
        print_results(&r, 10);
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Pos { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"12".to_string()), "POS 12 should be present");
    }

    #[test]
    fn modifier_lowercase_lt() {
        // User often types lowercase. Code-prefix is uppercased internally.
        let r = search_modifiers(&db(), "lt", 5).unwrap();
        print_header("lowercase 'lt'", "lt", "modifier");
        print_results(&r, 5);
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Modifier { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"LT".to_string()));
    }

    #[test]
    fn modifier_anatomical_f1_finger() {
        let r = search_modifiers(&db(), "F1", 5).unwrap();
        print_header("finger 'F1'", "F1", "modifier");
        print_results(&r, 5);
        let codes: Vec<_> = r
            .iter()
            .filter_map(|x| match x {
                SearchResult::Modifier { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect();
        assert!(codes.contains(&"F1".to_string()) || !r.is_empty(),
            "expected F1 (or at least some F-series match) in: {codes:?}");
    }

    #[test]
    fn modifier_empty_lists_all() {
        let r = search_modifiers(&db(), "", 100).unwrap();
        print_header("empty modifier query (lists all)", "", "modifier");
        print_results(&r, 5);
        assert!(r.len() >= 47, "expected all 47 modifiers, got {}", r.len());
    }

    // =====================================================================
    // MS-DRG — 770 codes
    // =====================================================================

    #[test]
    fn drg_full_number_291() {
        let r = search_drgs(&db(), "291", 5).unwrap();
        print_header("DRG 291 by full number", "291", "drg");
        print_results(&r, 5);
        let nums = drg_numbers(&r);
        assert!(nums.contains(&"291".to_string()));
    }

    #[test]
    fn drg_partial_number_29x() {
        // "29" prefix — user types middle of number, wants the 290s family.
        let r = search_drgs(&db(), "29", 30).unwrap();
        print_header("DRG prefix '29'", "29", "drg");
        print_results(&r, 12);
        let nums = drg_numbers(&r);
        for expected in ["291", "292", "293"] {
            assert!(
                nums.contains(&expected.to_string()),
                "expected DRG {expected} in: {nums:?}"
            );
        }
    }

    #[test]
    fn drg_single_digit_prefix_5() {
        // Lots of DRGs start with 5 — DRG 5 itself, 50–59, 500–599. User
        // intent is ambiguous, but we should at least surface SOMETHING.
        let r = search_drgs(&db(), "5", 30).unwrap();
        print_header("DRG single-digit prefix '5'", "5", "drg");
        print_results(&r, 15);
        assert!(!r.is_empty(), "single-digit '5' should match at least one DRG");
    }

    #[test]
    fn drg_three_digit_prefix_47x_joint_replacement() {
        // Joint replacement DRGs sit at 469/470/521-523. User types "47".
        let r = search_drgs(&db(), "47", 20).unwrap();
        print_header("DRG prefix '47' (joint replacement)", "47", "drg");
        print_results(&r, 8);
        let nums = drg_numbers(&r);
        assert!(nums.contains(&"470".to_string()),
            "expected DRG 470 (joint replacement w/o MCC), got: {nums:?}");
    }

    #[test]
    fn drg_word_heart_failure_finds_triplet() {
        let r = search_drgs(&db(), "heart failure", 10).unwrap();
        print_header("'heart failure'", "heart failure", "drg");
        print_results(&r, 6);
        let nums = drg_numbers(&r);
        for n in ["291", "292", "293"] {
            assert!(nums.contains(&n.to_string()), "expected {n} in: {nums:?}");
        }
    }

    #[test]
    fn drg_abbreviation_chf_expands_to_heart_failure() {
        // 'CHF' is in abbreviations.rs → "heart failure".
        let r = search_drgs(&db(), "CHF", 10).unwrap();
        print_header("abbrev 'CHF' (→ heart failure)", "CHF", "drg");
        print_results(&r, 6);
        let nums = drg_numbers(&r);
        assert!(
            nums.contains(&"291".to_string()),
            "CHF expansion should reach DRG 291 (Heart Failure with MCC); got {nums:?}"
        );
    }

    #[test]
    fn drg_abbreviation_copd() {
        let r = search_drgs(&db(), "COPD", 10).unwrap();
        print_header("abbrev 'COPD'", "COPD", "drg");
        print_results(&r, 6);
        let nums = drg_numbers(&r);
        // COPD DRGs are 190/191/192.
        assert!(
            nums.iter().any(|n| ["190", "191", "192"].contains(&n.as_str())),
            "COPD should reach DRG 190/191/192; got {nums:?}"
        );
    }

    #[test]
    fn drg_word_sepsis() {
        let r = search_drgs(&db(), "sepsis", 10).unwrap();
        print_header("'sepsis'", "sepsis", "drg");
        print_results(&r, 6);
        let nums = drg_numbers(&r);
        // Sepsis triplet is 870/871/872.
        assert!(
            nums.iter().any(|n| ["870", "871", "872"].contains(&n.as_str())),
            "sepsis should reach DRG 870/871/872; got {nums:?}"
        );
    }

    #[test]
    fn drg_word_pneumonia() {
        let r = search_drgs(&db(), "pneumonia", 10).unwrap();
        print_header("'pneumonia'", "pneumonia", "drg");
        print_results(&r, 6);
        let nums = drg_numbers(&r);
        assert!(!nums.is_empty(), "'pneumonia' should return at least one DRG");
    }

    #[test]
    fn drg_word_stroke() {
        let r = search_drgs(&db(), "stroke", 10).unwrap();
        print_header("'stroke'", "stroke", "drg");
        print_results(&r, 6);
        // We expect AT LEAST one stroke-named DRG.
        assert!(!r.is_empty(), "'stroke' should return at least one DRG");
    }

    #[test]
    fn drg_uppercase_lowercase_mixed() {
        let upper = drg_numbers(&search_drgs(&db(), "HEART FAILURE", 10).unwrap());
        let lower = drg_numbers(&search_drgs(&db(), "heart failure", 10).unwrap());
        let mixed = drg_numbers(&search_drgs(&db(), "HeArT FaIlUrE", 10).unwrap());
        print_header("case insensitivity check", "HEART/heart/HeArT", "drg");
        println!("    upper: {upper:?}");
        println!("    lower: {lower:?}");
        println!("    mixed: {mixed:?}");
        assert_eq!(upper, lower, "upper/lower DRG results should match");
        assert_eq!(lower, mixed, "lower/mixed DRG results should match");
    }

    #[test]
    fn drg_empty_returns_nothing() {
        assert!(search_drgs(&db(), "", 50).unwrap().is_empty());
    }

    // =====================================================================
    // ICD → DRG routing (reverse lookup mode)
    // =====================================================================

    #[test]
    fn icd_i509_routes_to_triplet_plus_neonate() {
        let r = search_drgs_by_icd(&db(), "I50.9", 20).unwrap();
        print_header("ICD I50.9 → DRG", "I50.9", "icdToDrg");
        print_results(&r, 10);
        let nums = drg_numbers(&r);
        for n in ["291", "292", "293"] {
            assert!(nums.contains(&n.to_string()), "{n} missing");
        }
        // Cross-MDC: I50.9 also routes to newborn (MDC 15) DRGs.
        assert!(
            nums.iter().any(|n| ["791", "793"].contains(&n.as_str())),
            "expected cross-MDC newborn routing 791/793; got: {nums:?}"
        );
    }

    #[test]
    fn icd_lowercase_and_whitespace_normalized() {
        let canon = drg_numbers(&search_drgs_by_icd(&db(), "I50.9", 10).unwrap());
        let lower = drg_numbers(&search_drgs_by_icd(&db(), "i50.9", 10).unwrap());
        let padded = drg_numbers(&search_drgs_by_icd(&db(), "  I50.9  ", 10).unwrap());
        let spaced = drg_numbers(&search_drgs_by_icd(&db(), "I50 .9", 10).unwrap());
        print_header(
            "ICD format variants (lowercase, spaces, padding)",
            "I50.9 variants",
            "icdToDrg",
        );
        println!("    canonical 'I50.9' → {canon:?}");
        println!("    lowercase 'i50.9' → {lower:?}");
        println!("    padded '  I50.9  ' → {padded:?}");
        println!("    spaced  'I50 .9' → {spaced:?}");
        assert_eq!(canon, lower, "lowercase should match");
        assert_eq!(canon, padded, "padding should match");
        assert_eq!(
            canon, spaced,
            "internal spaces should be stripped (user types ICD with stray spaces)"
        );
    }

    #[test]
    fn icd_dotless_form_is_not_currently_matched() {
        // Known limitation: DB stores codes in canonical dotted form
        // ("I50.9"). Dotless user input ("I509") doesn't auto-restore the
        // dot — would need a smarter normalizer. Documenting current
        // behavior so a future fix has a regression target.
        let dotted = drg_numbers(&search_drgs_by_icd(&db(), "I50.9", 10).unwrap());
        let dotless = drg_numbers(&search_drgs_by_icd(&db(), "I509", 10).unwrap());
        print_header(
            "ICD dotted vs dotless form (known limitation)",
            "I50.9 vs I509",
            "icdToDrg",
        );
        println!("    dotted  'I50.9' → {} hits", dotted.len());
        println!("    dotless 'I509'  → {} hits", dotless.len());
        assert!(!dotted.is_empty(), "dotted should work");
        assert!(
            dotless.is_empty(),
            "dotless currently doesn't match — if this starts passing, \
             update the normalizer comment in normalize_icd()"
        );
    }

    #[test]
    fn icd_three_char_category_codes() {
        // Three-char category codes (no decimal point) — e.g. A09, B20.
        for code in ["A09", "B20"] {
            let r = search_drgs_by_icd(&db(), code, 10).unwrap();
            print_header(&format!("ICD 3-char category {code}"), code, "icdToDrg");
            print_results(&r, 5);
            assert!(!r.is_empty(), "3-char {code} should route to at least one DRG");
        }
    }

    #[test]
    fn icd_common_sepsis_a419_routes_to_870s() {
        let r = search_drgs_by_icd(&db(), "A41.9", 10).unwrap();
        print_header("ICD A41.9 (sepsis) → DRG", "A41.9", "icdToDrg");
        print_results(&r, 8);
        let nums = drg_numbers(&r);
        for n in ["870", "871", "872"] {
            assert!(nums.contains(&n.to_string()), "expected {n}, got: {nums:?}");
        }
    }

    #[test]
    fn icd_unknown_returns_empty() {
        let r = search_drgs_by_icd(&db(), "Z99.9", 10).unwrap();
        print_header("ICD unknown 'Z99.9'", "Z99.9", "icdToDrg");
        print_results(&r, 3);
        assert!(r.is_empty());
    }

    // =====================================================================
    // CC/MCC classify + impact
    // =====================================================================

    #[test]
    fn classify_real_examples() {
        let cases = [
            ("N17.9", CcMccLevel::Cc, "AKI unspecified — CC per Appendix G"),
            ("J18.9", CcMccLevel::Mcc, "Pneumonia unspecified — MCC per Appendix H"),
            ("I50.21", CcMccLevel::Mcc, "Acute systolic heart failure — MCC"),
            ("Z99.9", CcMccLevel::None, "garbage / unknown"),
        ];
        println!("\n──── CC/MCC classification real-world ICDs");
        for (icd, expected, why) in cases {
            let r = classify_icd(&db(), icd).unwrap();
            println!(
                "    {icd:<8} → {actual:<5}  (expected {expected:?}) — {why}",
                icd = icd,
                actual = format!("{:?}", r.level),
            );
            assert_eq!(r.level, expected, "{icd}: {why}");
        }
    }

    #[test]
    fn impact_i509_with_various_secondaries() {
        let cases = [
            (vec![], CcMccLevel::None, "293", "no secondaries → without CC/MCC"),
            (vec!["N17.9"], CcMccLevel::Cc, "292", "+ AKI CC → with CC"),
            (vec!["J18.9"], CcMccLevel::Mcc, "291", "+ pneumonia MCC → with MCC"),
            (vec!["N17.9", "J18.9"], CcMccLevel::Mcc, "291", "AKI + pneumonia → MCC wins"),
            (vec!["Z99.9"], CcMccLevel::None, "293", "garbage secondary doesn't elevate"),
        ];
        println!("\n──── Impact calc — principal=I50.9 + various secondaries");
        for (secs, expected_level, expected_drg, desc) in cases {
            let r = compute_impact(
                &db(),
                "I50.9",
                &secs.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            )
            .unwrap();
            let routed = r.routed_drg.as_ref().map(|c| c.number.clone()).unwrap_or_default();
            println!(
                "    secs={secs:?} → level={level:?} routed=DRG {routed:<3}  ({desc})",
                level = r.highest_secondary_level,
                routed = routed,
            );
            assert_eq!(r.highest_secondary_level, expected_level, "{desc}");
            assert_eq!(routed, expected_drg, "{desc}");
        }
    }

    #[test]
    fn impact_weight_delta_positive_when_mcc_elevates() {
        // No-secondaries baseline = DRG 293 (Wt 0.566).
        // + N17.9 CC → DRG 292 (Wt 0.849). Delta should be ~+0.283.
        let r = compute_impact(&db(), "I50.9", &["N17.9".into()]).unwrap();
        let baseline_w = r.baseline_drg.as_ref().and_then(|c| c.relative_weight);
        let routed_w = r.routed_drg.as_ref().and_then(|c| c.relative_weight);
        println!(
            "\n──── Weight delta: I50.9 baseline → +N17.9 routed\n    baseline={baseline:?} routed={routed:?} delta={delta:?}",
            baseline = baseline_w,
            routed = routed_w,
            delta = r.weight_delta,
        );
        assert!(r.weight_delta.unwrap() > 0.0, "CC elevation should increase weight");
    }

    #[test]
    fn impact_unknown_principal_returns_empty_candidates() {
        let r = compute_impact(&db(), "Z99.9", &["N17.9".into()]).unwrap();
        println!(
            "\n──── Impact with unknown principal Z99.9: candidates={}, routed={:?}",
            r.candidate_drgs.len(),
            r.routed_drg
        );
        assert!(r.candidate_drgs.is_empty());
        assert!(r.routed_drg.is_none());
    }

    // =====================================================================
    // Mode collisions — typing in wrong mode shouldn't crash
    // =====================================================================

    #[test]
    fn typing_icd_in_drg_mode_doesnt_crash() {
        // User accidentally types ICD in DRG mode. Should return empty or
        // a FTS match (DRG names containing "I50") — never crash.
        let r = search_drgs(&db(), "I50.9", 5).unwrap();
        print_header("ICD 'I50.9' typed in DRG mode", "I50.9", "drg");
        print_results(&r, 5);
        // No assertion on count — just that the call succeeded.
    }

    #[test]
    fn typing_drg_number_in_pos_mode_doesnt_crash() {
        // User types "291" in POS mode. POS codes are 01-99 so "29"
        // partial matches but "291" exceeds 2-char POS range.
        let r = search_pos(&db(), "291", 5).unwrap();
        print_header("DRG number '291' typed in POS mode", "291", "pos");
        print_results(&r, 5);
        // Should be empty since no POS code starts with "291" — but no crash.
    }
}

