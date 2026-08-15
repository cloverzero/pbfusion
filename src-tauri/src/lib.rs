mod background;
mod commands;
mod models;
mod storage;

use background::BackgroundTaskState;
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
        .manage(BackgroundTaskState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            use tauri::Manager;
            use tauri_plugin_dialog::DialogExt;
            use tauri_plugin_dialog::MessageDialogKind;

            // When background tasks (diff analysis / merge export) are running, intercept the
            // close request and ask the user for confirmation before quitting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<BackgroundTaskState>();
                if state.has_active_tasks() {
                    api.prevent_close();
                    let summary = state
                        .active_summary()
                        .unwrap_or_else(|| "后台任务".to_string());
                    let win = window.clone();
                    win.dialog()
                        .message(format!(
                            "{}正在运行。\n\n强制退出会中断该任务，可能导致输出文件不完整。确定要退出吗？",
                            summary
                        ))
                        .title("后台任务运行中")
                        .kind(MessageDialogKind::Warning)
                        .show(move |confirmed| {
                            if confirmed {
                                let _ = win.destroy();
                            }
                        });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::delete_project,
            commands::project::create_project,
            commands::diff::list_diffs,
            commands::diff::settle_diff,
            commands::diff::get_diff_detail,
            commands::merge::merge_export,
            commands::settings::get_settings,
            commands::settings::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
