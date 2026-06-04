use std::fs;
use std::path::PathBuf;

use crate::models::{DiffItem, Project};

/// Get the data directory for app storage (~/.pbfusion or platform-equivalent)
fn data_dir() -> PathBuf {
    let dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    dir.join(".pbfusion")
}

fn projects_file() -> PathBuf {
    data_dir().join("projects.json")
}

fn diffs_dir(project_id: u32) -> PathBuf {
    data_dir().join("diffs").join(project_id.to_string())
}

fn diffs_file(project_id: u32) -> PathBuf {
    diffs_dir(project_id).join("diffs.json")
}

fn ensure_data_dir() -> std::io::Result<()> {
    let dir = data_dir();
    fs::create_dir_all(&dir)?;
    Ok(())
}

/// Use user's home directory for data storage
fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

// ── Project Storage ──

pub fn load_projects() -> std::io::Result<Vec<Project>> {
    ensure_data_dir()?;
    let path = projects_file();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let projects: Vec<Project> = serde_json::from_str(&content).unwrap_or_default();
    Ok(projects)
}

pub fn save_projects(projects: &[Project]) -> std::io::Result<()> {
    ensure_data_dir()?;
    let path = projects_file();
    let content = serde_json::to_string_pretty(projects)?;
    fs::write(&path, content)?;
    Ok(())
}

pub fn add_project(project: Project) -> std::io::Result<Project> {
    let mut projects = load_projects()?;
    projects.push(project.clone());
    save_projects(&projects)?;
    Ok(project)
}

pub fn update_project(updated: &Project) -> std::io::Result<()> {
    let mut projects = load_projects()?;
    if let Some(p) = projects.iter_mut().find(|p| p.id == updated.id) {
        *p = updated.clone();
    }
    save_projects(&projects)
}

pub fn delete_project(project_id: u32) -> std::io::Result<()> {
    let mut projects = load_projects()?;
    projects.retain(|p| p.id != project_id);
    save_projects(&projects)?;
    // Also clean up diffs
    let diffs = diffs_dir(project_id);
    if diffs.exists() {
        let _ = fs::remove_dir_all(diffs);
    }
    Ok(())
}

// ── Diff Storage ──

pub fn load_diffs(project_id: u32) -> std::io::Result<Vec<DiffItem>> {
    let path = diffs_file(project_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let diffs: Vec<DiffItem> = serde_json::from_str(&content).unwrap_or_default();
    Ok(diffs)
}

pub fn save_diffs(project_id: u32, diffs: &[DiffItem]) -> std::io::Result<()> {
    let dir = diffs_dir(project_id);
    fs::create_dir_all(&dir)?;
    let path = diffs_file(project_id);
    let content = serde_json::to_string_pretty(diffs)?;
    fs::write(&path, content)?;
    Ok(())
}

impl DiffItem {
    /// Get the cached source PBF path for this diff's project
    pub fn source_path(&self) -> String {
        format!("./task-{}-source.pbf", self.project_id)
    }

    /// Get the cached target PBF path for this diff's project
    pub fn target_path(&self) -> String {
        format!("./task-{}-target.pbf", self.project_id)
    }
}
