mod commands;
mod models;
mod storage;

use models::ElementType;

// ───── ElementType conversion helper for pbf-craft ─────

impl From<ElementType> for pbf_craft::models::ElementType {
    fn from(et: ElementType) -> Self {
        match et {
            ElementType::Node => pbf_craft::models::ElementType::Node,
            ElementType::Way => pbf_craft::models::ElementType::Way,
            ElementType::Relation => pbf_craft::models::ElementType::Relation,
        }
    }
}

// ──────────────────────────────────────────────
// App Entry
// ──────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::delete_project,
            commands::project::create_project,
            commands::diff::list_diffs,
            commands::diff::settle_diff,
            commands::diff::get_diff_detail,
            commands::merge::merge_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
