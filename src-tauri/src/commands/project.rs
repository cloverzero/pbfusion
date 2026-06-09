use std::path::Path;

use chrono::Utc;
use crate::models::{CreateProjectRequest, ListParams, Project, ProjectStatus};
use crate::storage;

use super::diff::run_diff_analysis;

// ──────────────────────────────────────────────
// Project CRUD Commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn list_projects(params: Option<ListParams>) -> Result<Vec<Project>, String> {
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    if let Some(p) = params {
        if let Some(ref search) = p.search {
            let search_lower = search.to_lowercase();
            return Ok(projects
                .into_iter()
                .filter(|proj| proj.name.to_lowercase().contains(&search_lower))
                .collect());
        }
    }
    Ok(projects)
}

#[tauri::command]
pub fn get_project(id: u32) -> Result<Project, String> {
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    projects
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Project {} not found", id))
}

#[tauri::command]
pub fn delete_project(id: u32) -> Result<(), String> {
    storage::delete_project(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_project(
    app: tauri::AppHandle,
    request: CreateProjectRequest,
) -> Result<Project, String> {
    // Validate paths
    if !Path::new(&request.source_path).exists() {
        return Err(format!("Source file not found: {}", request.source_path));
    }
    if !Path::new(&request.target_path).exists() {
        return Err(format!("Target file not found: {}", request.target_path));
    }

    // Generate new ID
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    let next_id = projects.iter().map(|p| p.id).max().unwrap_or(0) + 1;

    let now = Utc::now();
    let project = Project {
        id: next_id,
        name: request.name.clone(),
        source_path: request.source_path.clone(),
        target_path: request.target_path.clone(),
        output_path: None,
        status: ProjectStatus::Preparing,
        created_at: now,
        updated_at: now,
        total_diffs: 0,
        settled_diffs: 0,
    };

    let project = storage::add_project(project).map_err(|e| e.to_string())?;

    // Spawn background diff analysis
    let app_handle = app.clone();
    let source_path = request.source_path;
    let target_path = request.target_path;
    let project_id = next_id;
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_diff_analysis(app_handle, project_id, &source_path, &target_path).await
        {
            eprintln!("Diff analysis failed for project {}: {}", project_id, e);
            let projects = storage::load_projects().unwrap_or_default();
            if let Some(mut p) = projects.into_iter().find(|p| p.id == project_id) {
                p.status = ProjectStatus::Failed;
                p.updated_at = Utc::now();
                let _ = storage::update_project(&p);
            }
        }
    });

    Ok(project)
}
