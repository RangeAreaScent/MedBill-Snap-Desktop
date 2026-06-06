mod abbreviations;
mod license;
mod medbill;
mod menu;
mod pdf;
mod store;

use std::path::PathBuf;
use tauri::Manager;

/// Resolved at startup so commands never have to re-resolve paths.
struct AppState {
    db_path: PathBuf,
    data_dir: PathBuf,
}

// =====================================================================
// Search commands — one per mode
// =====================================================================

#[tauri::command]
fn search_pos(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<medbill::SearchResult>, String> {
    medbill::search_pos(&state.db_path, &query, limit.unwrap_or(50))
}

#[tauri::command]
fn search_modifiers(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<medbill::SearchResult>, String> {
    medbill::search_modifiers(&state.db_path, &query, limit.unwrap_or(100))
}

#[tauri::command]
fn search_drgs(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<medbill::SearchResult>, String> {
    medbill::search_drgs(&state.db_path, &query, limit.unwrap_or(50))
}

#[tauri::command]
fn search_drgs_by_icd(
    state: tauri::State<'_, AppState>,
    icd: String,
    limit: Option<usize>,
) -> Result<Vec<medbill::SearchResult>, String> {
    medbill::search_drgs_by_icd(&state.db_path, &icd, limit.unwrap_or(50))
}

// =====================================================================
// Detail commands
// =====================================================================

#[tauri::command]
fn get_pos_detail(
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<Option<medbill::PosDetail>, String> {
    medbill::fetch_pos(&state.db_path, &code)
}

#[tauri::command]
fn get_modifier_detail(
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<Option<medbill::ModifierDetail>, String> {
    medbill::fetch_modifier(&state.db_path, &code)
}

#[tauri::command]
fn get_drg_detail(
    state: tauri::State<'_, AppState>,
    number: String,
) -> Result<Option<medbill::DrgDetail>, String> {
    medbill::fetch_drg(&state.db_path, &number)
}

// =====================================================================
// CC/MCC + impact commands
// =====================================================================

#[tauri::command]
fn classify_icd(
    state: tauri::State<'_, AppState>,
    icd: String,
) -> Result<medbill::CcMccEntry, String> {
    medbill::classify_icd(&state.db_path, &icd)
}

#[tauri::command]
fn compute_impact(
    state: tauri::State<'_, AppState>,
    principal_icd: String,
    secondary_icds: Vec<String>,
) -> Result<medbill::ImpactResult, String> {
    medbill::compute_impact(&state.db_path, &principal_icd, &secondary_icds)
}

// =====================================================================
// MDC browser + topics
// =====================================================================

#[tauri::command]
fn list_mdcs(state: tauri::State<'_, AppState>) -> Result<Vec<medbill::MdcCategory>, String> {
    medbill::list_mdcs(&state.db_path)
}

#[tauri::command]
fn list_drgs_by_mdc(
    state: tauri::State<'_, AppState>,
    mdc_code: String,
) -> Result<Vec<medbill::SearchResult>, String> {
    medbill::list_drgs_by_mdc(&state.db_path, &mdc_code)
}

#[tauri::command]
fn list_topics(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<medbill::BillingTopic>, String> {
    medbill::list_topics(&state.db_path)
}

// =====================================================================
// Store + file IO
// =====================================================================

#[tauri::command]
fn store_read(state: tauri::State<'_, AppState>, name: String) -> Result<Option<String>, String> {
    store::read(&state.data_dir, &name)
}

#[tauri::command]
fn store_write(
    state: tauri::State<'_, AppState>,
    name: String,
    content: String,
) -> Result<(), String> {
    store::write(&state.data_dir, &name, &content)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("failed to write file: {e}"))
}

#[tauri::command]
fn export_pdf(
    path: String,
    title: String,
    entries: Vec<pdf::ExportEntry>,
) -> Result<(), String> {
    pdf::export(&path, &title, &entries)
}

// =====================================================================
// License commands
// =====================================================================

#[tauri::command]
fn license_status(state: tauri::State<'_, AppState>) -> license::LicenseState {
    license::status(&state.data_dir)
}

#[tauri::command]
fn license_activate(
    state: tauri::State<'_, AppState>,
    key: String,
) -> Result<license::LicenseState, String> {
    license::activate(&state.data_dir, &key)
}

#[tauri::command]
fn license_validate(state: tauri::State<'_, AppState>) -> license::LicenseState {
    license::validate(&state.data_dir)
}

#[tauri::command]
fn license_deactivate(
    state: tauri::State<'_, AppState>,
) -> Result<license::LicenseState, String> {
    license::deactivate(&state.data_dir)
}

#[tauri::command]
fn license_toggle_override(
    state: tauri::State<'_, AppState>,
) -> Result<license::LicenseState, String> {
    license::toggle_override(&state.data_dir)
}

// =====================================================================
// Entry
// =====================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = app
                .path()
                .resolve(
                    "resources/medbill_v1.sqlite",
                    tauri::path::BaseDirectory::Resource,
                )
                .expect("bundled MedBill database resource is missing");
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");
            app.manage(AppState { db_path, data_dir });
            // Phase D — install the native menu bar.
            menu::install(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            search_pos,
            search_modifiers,
            search_drgs,
            search_drgs_by_icd,
            get_pos_detail,
            get_modifier_detail,
            get_drg_detail,
            classify_icd,
            compute_impact,
            list_mdcs,
            list_drgs_by_mdc,
            list_topics,
            store_read,
            store_write,
            write_text_file,
            export_pdf,
            license_status,
            license_activate,
            license_validate,
            license_deactivate,
            license_toggle_override
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
