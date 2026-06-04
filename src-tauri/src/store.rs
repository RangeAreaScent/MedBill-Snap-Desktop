//! Tiny JSON document store for user data (favorites, recents, ...).
//! Each document is a single JSON file under the app data directory.
//! The frontend owns the schema; this layer only persists raw JSON text.

use std::fs;
use std::path::{Path, PathBuf};

/// Only allow simple file stems so a document name can never escape the
/// app data directory.
fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn doc_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !is_safe_name(name) {
        return Err(format!("invalid store name: {name}"));
    }
    Ok(dir.join(format!("{name}.json")))
}

/// Reads a document. Returns `None` if it does not exist yet.
pub fn read(dir: &Path, name: &str) -> Result<Option<String>, String> {
    let path = doc_path(dir, name)?;
    match fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("failed to read {name}: {e}")),
    }
}

/// Writes a document atomically (write to a temp file, then rename) so a
/// crash mid-write can never leave a half-written, corrupt file.
pub fn write(dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let path = doc_path(dir, name)?;
    fs::create_dir_all(dir).map_err(|e| format!("failed to create data dir: {e}"))?;

    // Validate it is well-formed JSON before persisting.
    serde_json::from_str::<serde_json::Value>(content)
        .map_err(|e| format!("refusing to write invalid JSON to {name}: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content).map_err(|e| format!("failed to write {name}: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("failed to commit {name}: {e}"))?;
    Ok(())
}
