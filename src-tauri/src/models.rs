use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: u32,
    pub name: String,
    pub source_path: String,
    pub target_path: String,
    pub output_path: Option<String>,
    pub status: ProjectStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub total_diffs: u32,
    pub settled_diffs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProjectStatus {
    Preparing,
    InProgress,
    Completed,
    Failed,
}

impl std::fmt::Display for ProjectStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectStatus::Preparing => write!(f, "Preparing"),
            ProjectStatus::InProgress => write!(f, "InProgress"),
            ProjectStatus::Completed => write!(f, "Completed"),
            ProjectStatus::Failed => write!(f, "Failed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffItem {
    pub id: u32,
    pub project_id: u32,
    pub element_type: ElementType,
    pub element_id: i64,
    pub diff_type: DiffType,
    pub settlement: Option<Settlement>,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum ElementType {
    Node,
    Way,
    Relation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DiffType {
    Added,
    Removed,
    Modified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Settlement {
    Source,
    Target,
    Custom,
}

/// Project creation request from frontend
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub source_path: String,
    pub target_path: String,
}

/// Paged response wrapper
#[derive(Debug, Serialize)]
pub struct PagedData<T> {
    pub data: Vec<T>,
    pub total: i64,
}

/// List parameters with optional search
#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub search: Option<String>,
}

/// Diff list filter params
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFilter {
    pub element_type: Option<String>,
    pub diff_type: Option<String>,
    pub only_unsettled: Option<bool>,
    pub element_id: Option<i64>,
}

/// Request to settle a diff
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleDiffRequest {
    pub settlement: String,
    pub result: Option<String>,
}

/// Detailed diff view including full elements with dependencies
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffDetail {
    pub id: u32,
    pub project_id: u32,
    pub element_type: ElementType,
    pub element_id: i64,
    pub diff_type: DiffType,
    pub settlement: Option<Settlement>,
    pub result: Option<String>,
    pub source: Vec<pbf_craft::models::Element>,
    pub target: Vec<pbf_craft::models::Element>,
    pub related: Vec<DiffItem>,
}
