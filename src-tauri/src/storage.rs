use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{AppSettings, DiffFilter, DiffItem, DiffType, ElementType, Project, Settlement};

// ──────────────────────────────────────────────
// Settings file (always at ~/.pbfusion/settings.json)
// ──────────────────────────────────────────────

fn settings_file() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    home.join(".pbfusion").join("settings.json")
}

pub fn load_settings() -> std::io::Result<AppSettings> {
    let path = settings_file();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

pub fn save_settings(settings: &AppSettings) -> std::io::Result<()> {
    let path = settings_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(settings)?;
    fs::write(&path, content)
}

// ──────────────────────────────────────────────
// Data directory (configurable via settings)
// ──────────────────────────────────────────────

fn data_dir() -> PathBuf {
    match load_settings() {
        Ok(s) => PathBuf::from(&s.home_dir),
        Err(_) => {
            let dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
            dir.join(".pbfusion")
        }
    }
}

pub fn export_dir() -> PathBuf {
    match load_settings() {
        Ok(s) => PathBuf::from(&s.export_dir),
        Err(_) => {
            let dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
            dir.join(".pbfusion").join("output")
        }
    }
}

fn projects_file() -> PathBuf {
    data_dir().join("projects.json")
}

fn diffs_dir(project_id: u32) -> PathBuf {
    data_dir().join("diffs").join(project_id.to_string())
}

fn diffs_db_file(project_id: u32) -> PathBuf {
    diffs_dir(project_id).join("diffs.db")
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
    // Also clean up diffs (SQLite database lives inside the per-project diffs dir)
    let diffs = diffs_dir(project_id);
    if diffs.exists() {
        let _ = fs::remove_dir_all(diffs);
    }
    Ok(())
}

// ──────────────────────────────────────────────
// Diff Storage (SQLite, one database per project)
// ──────────────────────────────────────────────

const CREATE_DIFFS_TABLE: &str = "
CREATE TABLE IF NOT EXISTS diffs (
    id            INTEGER PRIMARY KEY,
    element_type  TEXT    NOT NULL,
    element_id    INTEGER NOT NULL,
    diff_type     TEXT    NOT NULL,
    settlement    TEXT,
    result        TEXT,
    source_author TEXT,
    target_author TEXT
);
CREATE INDEX IF NOT EXISTS idx_diffs_type_id ON diffs(element_type, element_id);
CREATE INDEX IF NOT EXISTS idx_diffs_settled ON diffs(settlement);
";

/// Open (creating if needed) the SQLite database for a project's diffs.
fn open_diff_db(project_id: u32) -> rusqlite::Result<Connection> {
    let dir = diffs_dir(project_id);
    fs::create_dir_all(&dir).map_err(|e| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(e))
    })?;
    let conn = Connection::open(diffs_db_file(project_id))?;
    conn.execute_batch(CREATE_DIFFS_TABLE)?;
    Ok(conn)
}

/// Insert all diffs in a single transaction. Used after diff analysis completes.
pub fn save_diffs(project_id: u32, diffs: &[DiffItem]) -> rusqlite::Result<()> {
    insert_diffs_batch(project_id, diffs)
}

/// Insert one batch of diffs in a single transaction.
///
/// Diff analysis may produce millions of entries; callers should flush in batches (e.g. every
/// 10k entries) to keep the in-memory buffer bounded and spread write I/O across the scan.
/// Batches are independent transactions, so a crash only loses the current batch.
pub fn insert_diffs_batch(project_id: u32, batch: &[DiffItem]) -> rusqlite::Result<()> {
    if batch.is_empty() {
        return Ok(());
    }
    let mut conn = open_diff_db(project_id)?;
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO diffs
                (id, element_type, element_id, diff_type, settlement, result, source_author, target_author)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for d in batch {
            stmt.execute(params![
                d.id,
                element_type_str(d.element_type),
                d.element_id,
                diff_type_str(d.diff_type),
                d.settlement.map(settlement_str),
                d.result,
                d.source_author,
                d.target_author,
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Fetch a single diff by id, or `None` when it does not exist.
pub fn get_diff(project_id: u32, diff_id: u32) -> rusqlite::Result<Option<DiffItem>> {
    let conn = open_diff_db(project_id)?;
    conn.query_row(
        "SELECT id, element_type, element_id, diff_type, settlement, result, source_author, target_author
         FROM diffs WHERE id = ?1",
        params![diff_id],
        |row| row_to_diff(row, project_id),
    )
    .optional()
}

/// Count diffs matching the filter (ignores pagination).
pub fn count_diffs(project_id: u32, filter: &DiffFilter) -> rusqlite::Result<i64> {
    let conn = open_diff_db(project_id)?;
    let (where_sql, where_params) = build_filter_sql(filter);
    let sql = format!("SELECT COUNT(*) FROM diffs {}", where_sql);
    let mut stmt = conn.prepare(&sql)?;
    let count: i64 = stmt.query_row(where_params.as_params(), |row| row.get(0))?;
    Ok(count)
}

/// Fetch a page of diffs matching the filter, ordered by id (analysis order).
///
/// Returns `(items, total_matching)`. `limit`/`offset` are the pagination window.
pub fn list_diffs_page(
    project_id: u32,
    filter: &DiffFilter,
    limit: i64,
    offset: i64,
) -> rusqlite::Result<(Vec<DiffItem>, i64)> {
    let conn = open_diff_db(project_id)?;
    let (where_sql, where_params) = build_filter_sql(filter);

    let count_sql = format!("SELECT COUNT(*) FROM diffs {}", where_sql);
    let mut count_stmt = conn.prepare(&count_sql)?;
    let total: i64 = count_stmt.query_row(where_params.as_params(), |row| row.get(0))?;

    let page_sql = format!(
        "SELECT id, element_type, element_id, diff_type, settlement, result, source_author, target_author
         FROM diffs {} ORDER BY id LIMIT ? OFFSET ?",
        where_sql
    );
    let mut stmt = conn.prepare(&page_sql)?;
    let mut params_vec = where_params.values;
    params_vec.push(rusqlite::types::Value::Integer(limit));
    params_vec.push(rusqlite::types::Value::Integer(offset));
    let items = stmt
        .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
            row_to_diff(row, project_id)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok((items, total))
}

/// Update the settlement (and optional custom result) of a single diff.
pub fn update_diff_settlement(
    project_id: u32,
    diff_id: u32,
    settlement: Option<Settlement>,
    result: Option<String>,
) -> rusqlite::Result<()> {
    let conn = open_diff_db(project_id)?;
    conn.execute(
        "UPDATE diffs SET settlement = ?1, result = ?2 WHERE id = ?3",
        params![settlement.map(settlement_str), result, diff_id],
    )?;
    Ok(())
}

/// Count how many diffs of a project have been settled.
pub fn count_settled_diffs(project_id: u32) -> rusqlite::Result<u32> {
    let conn = open_diff_db(project_id)?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM diffs WHERE settlement IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

/// Read all diffs of a project ordered by id (which equals the analysis order, i.e. the
/// merge output order). Used by merge export, which must process every diff.
pub fn load_all_diffs(project_id: u32) -> rusqlite::Result<Vec<DiffItem>> {
    let conn = open_diff_db(project_id)?;
    let mut stmt = conn.prepare(
        "SELECT id, element_type, element_id, diff_type, settlement, result, source_author, target_author
         FROM diffs ORDER BY id",
    )?;
    let items = stmt
        .query_map([], |row| row_to_diff(row, project_id))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

/// Fetch the first unsettled diff (lowest id), if any. Used to build a helpful error message.
pub fn first_unsettled_diff(project_id: u32) -> rusqlite::Result<Option<DiffItem>> {
    let conn = open_diff_db(project_id)?;
    conn.query_row(
        "SELECT id, element_type, element_id, diff_type, settlement, result, source_author, target_author
         FROM diffs WHERE settlement IS NULL ORDER BY id LIMIT 1",
        [],
        |row| row_to_diff(row, project_id),
    )
    .optional()
}

// ── SQL helpers ──

struct FilterParams {
    values: Vec<rusqlite::types::Value>,
}

impl FilterParams {
    fn as_params(&self) -> rusqlite::ParamsFromIter<std::slice::Iter<'_, rusqlite::types::Value>> {
        rusqlite::params_from_iter(self.values.iter())
    }
}

/// Build the `WHERE ...` clause (possibly empty) plus its bound parameters for a DiffFilter.
fn build_filter_sql(filter: &DiffFilter) -> (String, FilterParams) {
    let mut clauses: Vec<String> = Vec::new();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(ref et) = filter.element_type {
        clauses.push("element_type = ?".to_string());
        values.push(rusqlite::types::Value::Text(et.clone()));
    }
    if let Some(ref dt) = filter.diff_type {
        clauses.push("diff_type = ?".to_string());
        values.push(rusqlite::types::Value::Text(dt.clone()));
    }
    if filter.only_unsettled.unwrap_or(false) {
        clauses.push("settlement IS NULL".to_string());
    }
    if let Some(eid) = filter.element_id {
        clauses.push("element_id = ?".to_string());
        values.push(rusqlite::types::Value::Integer(eid));
    }

    if clauses.is_empty() {
        (String::new(), FilterParams { values })
    } else {
        (
            format!("WHERE {}", clauses.join(" AND ")),
            FilterParams { values },
        )
    }
}

// ── Row ↔ model conversions ──

fn row_to_diff(row: &rusqlite::Row<'_>, project_id: u32) -> rusqlite::Result<DiffItem> {
    let element_type: String = row.get(1)?;
    let diff_type: String = row.get(3)?;
    let settlement: Option<String> = row.get(4)?;
    Ok(DiffItem {
        id: row.get(0)?,
        project_id,
        element_type: parse_element_type(&element_type),
        element_id: row.get(2)?,
        diff_type: parse_diff_type(&diff_type),
        settlement: settlement.map(|s| parse_settlement(&s)),
        result: row.get(5)?,
        source_author: row.get(6)?,
        target_author: row.get(7)?,
    })
}

fn element_type_str(t: ElementType) -> &'static str {
    match t {
        ElementType::Node => "Node",
        ElementType::Way => "Way",
        ElementType::Relation => "Relation",
    }
}

fn parse_element_type(s: &str) -> ElementType {
    match s {
        "Way" => ElementType::Way,
        "Relation" => ElementType::Relation,
        _ => ElementType::Node,
    }
}

fn diff_type_str(t: DiffType) -> &'static str {
    match t {
        DiffType::Added => "Added",
        DiffType::Removed => "Removed",
        DiffType::Modified => "Modified",
    }
}

fn parse_diff_type(s: &str) -> DiffType {
    match s {
        "Removed" => DiffType::Removed,
        "Modified" => DiffType::Modified,
        _ => DiffType::Added,
    }
}

fn settlement_str(s: Settlement) -> &'static str {
    match s {
        Settlement::Source => "Source",
        Settlement::Target => "Target",
        Settlement::Custom => "Custom",
    }
}

fn parse_settlement(s: &str) -> Settlement {
    match s {
        "Source" => Settlement::Source,
        "Target" => Settlement::Target,
        _ => Settlement::Custom,
    }
}
