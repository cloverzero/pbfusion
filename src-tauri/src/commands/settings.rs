use crate::models::{AppSettings, UpdateSettingsRequest};
use crate::storage;

// ──────────────────────────────────────────────
// Settings Commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    storage::load_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(request: UpdateSettingsRequest) -> Result<AppSettings, String> {
    let mut settings = storage::load_settings().map_err(|e| e.to_string())?;

    if let Some(home_dir) = request.home_dir {
        settings.home_dir = home_dir;
    }
    if let Some(export_dir) = request.export_dir {
        settings.export_dir = export_dir;
    }

    storage::save_settings(&settings).map_err(|e| e.to_string())?;

    Ok(settings)
}
