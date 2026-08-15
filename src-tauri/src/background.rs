use std::sync::{Arc, Mutex};

/// The kind of long-running background task currently in flight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundTaskKind {
    /// Diff analysis spawned by `create_project`.
    DiffAnalysis,
    /// Merge export spawned by `merge_export`.
    Merge,
}

impl BackgroundTaskKind {
    /// Human-readable description used in the close-confirmation dialog.
    pub fn description(&self, project_name: &str) -> String {
        match self {
            BackgroundTaskKind::DiffAnalysis => {
                format!("正在对比项目 “{}” 的 PBF 差异", project_name)
            }
            BackgroundTaskKind::Merge => {
                format!("正在合并项目 “{}” 的 PBF 文件", project_name)
            }
        }
    }
}

struct BackgroundTask {
    kind: BackgroundTaskKind,
    project_id: u32,
    project_name: String,
}

/// Tracks in-flight background tasks (diff analysis / merge export).
///
/// Managed as Tauri state and consulted by the window close handler: when at least one task is
/// running, closing the window is intercepted and the user is asked for confirmation.
///
/// Cloning shares the same underlying registry (via `Arc`), so a clone can be moved into a
/// spawned task to mark the task as finished when it settles.
#[derive(Clone, Default)]
pub struct BackgroundTaskState {
    tasks: Arc<Mutex<Vec<BackgroundTask>>>,
}

impl BackgroundTaskState {
    /// Register a task as running. Call from the command that spawns the background work.
    pub fn start(&self, kind: BackgroundTaskKind, project_id: u32, project_name: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.retain(|t| !(t.kind == kind && t.project_id == project_id));
        tasks.push(BackgroundTask {
            kind,
            project_id,
            project_name: project_name.to_string(),
        });
    }

    /// Remove a finished (or failed) task. Call when the background work settles.
    pub fn finish(&self, kind: BackgroundTaskKind, project_id: u32) {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.retain(|t| !(t.kind == kind && t.project_id == project_id));
    }

    /// Whether any background task is currently running.
    pub fn has_active_tasks(&self) -> bool {
        !self.tasks.lock().unwrap().is_empty()
    }

    /// A short human-readable summary of the first active task, for the close dialog.
    pub fn active_summary(&self) -> Option<String> {
        let tasks = self.tasks.lock().unwrap();
        tasks
            .first()
            .map(|t| t.kind.description(&t.project_name))
    }
}
