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

#[derive(Serialize, Clone)]
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
