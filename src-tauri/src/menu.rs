//! Phase D (SNAP_DESKTOP_IMPROVEMENT_PLAN.md) — native menu bar.
//!
//! Defines the macOS / Windows menu bar. Every menu item that fires a
//! UI action emits a `menu:<id>` window event; the React side (App.tsx)
//! listens via `@tauri-apps/api/event` and routes to the same handlers
//! the keyboard shortcuts already use. No duplicated behavior — the
//! menu is a discoverable surface over the existing keyboard contract.
//!
//! MedBill deviations from the Tariff-Snap-UK reference:
//!   - 6 tabs (Calculator + DRG Browser instead of Calculator+Browse alone)
//!   - No NI Mode toggle (MedBill has no equivalent domain toggle)
//!   - "Open in Calculator" replaced by "Open CC/MCC Calculator…"
//!   - Help links point at MedBill Snap repo + CMS attribution page
//!
//! Menu IDs (kept stable; the React side hard-codes these strings):
//!   file.new_search             ⌘N
//!   file.command_palette        ⌘K
//!   file.export_collection      ⌘E
//!   edit.copy_code              ⌘⇧C
//!   edit.find                   ⌘F
//!   view.tab_search             ⌘1
//!   view.tab_calculator         ⌘2
//!   view.tab_drg                ⌘3
//!   view.tab_favorites          ⌘4
//!   view.tab_collections        ⌘5
//!   view.tab_settings           ⌘,
//!   view.reset_splitter
//!   help.how_to_use
//!   help.database_details
//!   help.privacy_policy         (opens URL)
//!   help.cms_link               (opens URL)
//!   help.source_link            (opens URL)

use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Runtime, Wry};

/// Build the full menu tree and install it on the app. Called from
/// `setup()` in lib.rs.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    app.set_menu(menu)?;
    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // App menu (macOS only — Windows ignores; harmless).
    let app_about = AboutMetadata {
        name: Some("MedBill Snap".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("© Ryan".into()),
        ..Default::default()
    };
    let app_submenu = SubmenuBuilder::new(app, "MedBill Snap")
        .item(&PredefinedMenuItem::about(app, None, Some(app_about))?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "view.tab_settings",
            "Preferences…",
            true,
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&MenuItem::with_id(
            app,
            "file.new_search",
            "New Search",
            true,
            Some("CmdOrCtrl+N"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "file.command_palette",
            "Open Command Palette…",
            true,
            Some("CmdOrCtrl+K"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "file.export_collection",
            "Export Open Collection as CSV…",
            true,
            Some("CmdOrCtrl+E"),
        )?)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "edit.copy_code",
            "Copy Code",
            true,
            Some("CmdOrCtrl+Shift+C"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "edit.find",
            "Find…",
            true,
            Some("CmdOrCtrl+F"),
        )?)
        .build()?;

    // View — 6 tabs (MedBill deviation from the 5-tab reference).
    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&MenuItem::with_id(
            app,
            "view.tab_search",
            "Search",
            true,
            Some("CmdOrCtrl+1"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "view.tab_calculator",
            "CC/MCC Impact Calculator",
            true,
            Some("CmdOrCtrl+2"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "view.tab_drg",
            "DRG Browser",
            true,
            Some("CmdOrCtrl+3"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "view.tab_favorites",
            "Favorites",
            true,
            Some("CmdOrCtrl+4"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "view.tab_collections",
            "Collections",
            true,
            Some("CmdOrCtrl+5"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "view.reset_splitter",
            "Reset Splitter Width",
            true,
            None::<&str>,
        )?)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItem::with_id(
            app,
            "help.how_to_use",
            "How to Use…",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            "help.database_details",
            "Database Details…",
            true,
            None::<&str>,
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "help.privacy_policy",
            "Privacy Policy",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            "help.cms_link",
            "CMS MS-DRG Definitions Manual (web)",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            "help.source_link",
            "MedBill Snap on GitHub",
            true,
            None::<&str>,
        )?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()
}

/// Handle a menu click. For UI-routed items we just emit `menu:<id>`
/// and let React dispatch. For URL items we open the browser.
pub fn handle(app: &AppHandle<Wry>, id: &str) {
    match id {
        // External URLs — opened natively, no React round-trip.
        "help.privacy_policy" => {
            open_url(app, "https://rangeareascent.github.io/Snap_Series/medbillsnap/privacy/");
        }
        "help.cms_link" => {
            open_url(app, "https://www.cms.gov/icd10m/FY2026-fr-v43-fullcode-cms/fullcode_cms/");
        }
        "help.source_link" => {
            open_url(app, "https://github.com/RangeAreaScent/MedBill-Snap-Desktop");
        }
        // All other menu items defer to React.
        other => {
            // emit ignores result — if no window is up the menu can't
            // have fired anyway.
            let _ = app.emit(&format!("menu:{other}"), ());
        }
    }
}

fn open_url(app: &AppHandle<Wry>, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
}
