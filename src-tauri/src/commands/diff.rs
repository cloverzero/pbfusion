use chrono::Utc;
use pbf_craft::models::Element;
use pbf_craft::readers::{IndexedReader, IterableReader};
use tauri::Emitter;

use crate::models::{
    DiffDetail, DiffFilter, DiffItem, DiffType, ElementType, PagedData, ProjectStatus,
    Settlement, SettleDiffRequest,
};
use crate::storage;

// ──────────────────────────────────────────────
// Diff Analysis
// ──────────────────────────────────────────────

/// How often (in milliseconds) a `diff-progress` event may be emitted at most.
const PROGRESS_EMIT_INTERVAL_MS: u128 = 250;

pub(crate) async fn run_diff_analysis(
    app: tauri::AppHandle,
    project_id: u32,
    source_path: &str,
    target_path: &str,
) -> anyhow::Result<()> {
    let source = IterableReader::from_path(source_path)?;
    let target = IterableReader::from_path(target_path)?;

    let mut source_iter = source.into_iter();
    let mut target_iter = target.into_iter();

    let mut diffs: Vec<DiffItem> = Vec::new();
    let mut diff_id: u32 = 1;

    let mut source_next = source_iter.next();
    let mut target_next = target_iter.next();

    let mut last_progress_emit = std::time::Instant::now();

    loop {
        match (&source_next, &target_next) {
            (None, None) => break,
            (Some(_), None) => {
                while let Some(el) = source_next {
                    let (et, eid) = element_key(&el);
                    diffs.push(DiffItem {
                        id: diff_id,
                        project_id,
                        element_type: et,
                        element_id: eid,
                        diff_type: DiffType::Removed,
                        settlement: None,
                        result: None,
                        source_author: element_author(&el),
                        target_author: None,
                    });
                    diff_id += 1;
                    source_next = source_iter.next();
                }
            }
            (None, Some(_)) => {
                while let Some(el) = target_next {
                    let (et, eid) = element_key(&el);
                    diffs.push(DiffItem {
                        id: diff_id,
                        project_id,
                        element_type: et,
                        element_id: eid,
                        diff_type: DiffType::Added,
                        settlement: None,
                        result: None,
                        source_author: None,
                        target_author: element_author(&el),
                    });
                    diff_id += 1;
                    target_next = target_iter.next();
                }
            }
            (Some(src_el), Some(tgt_el)) => {
                let (src_type, src_id) = element_key(src_el);
                let (tgt_type, tgt_id) = element_key(tgt_el);

                match (src_type, tgt_type) {
                    _ if src_type == tgt_type && src_id == tgt_id => {
                        if !elements_equal(src_el, tgt_el) {
                            diffs.push(DiffItem {
                                id: diff_id,
                                project_id,
                                element_type: src_type,
                                element_id: src_id,
                                diff_type: DiffType::Modified,
                                settlement: None,
                                result: None,
                                source_author: element_author(src_el),
                                target_author: element_author(tgt_el),
                            });
                            diff_id += 1;
                        }
                        source_next = source_iter.next();
                        target_next = target_iter.next();
                    }
                    _ if element_order(src_el) < element_order(tgt_el) => {
                        diffs.push(DiffItem {
                            id: diff_id,
                            project_id,
                            element_type: src_type,
                            element_id: src_id,
                            diff_type: DiffType::Removed,
                            settlement: None,
                            result: None,
                            source_author: element_author(src_el),
                            target_author: None,
                        });
                        diff_id += 1;
                        source_next = source_iter.next();
                    }
                    _ => {
                        diffs.push(DiffItem {
                            id: diff_id,
                            project_id,
                            element_type: tgt_type,
                            element_id: tgt_id,
                            diff_type: DiffType::Added,
                            settlement: None,
                            result: None,
                            source_author: None,
                            target_author: element_author(tgt_el),
                        });
                        diff_id += 1;
                        target_next = target_iter.next();
                    }
                }
            }
        }

        // Throttled progress sampling: emit at most every PROGRESS_EMIT_INTERVAL_MS.
        if last_progress_emit.elapsed().as_millis() >= PROGRESS_EMIT_INTERVAL_MS {
            let sp = source_iter.progress();
            let tp = target_iter.progress();
            let total = sp.total_bytes.unwrap_or(0) + tp.total_bytes.unwrap_or(0);
            let read = sp.bytes_read + tp.bytes_read;
            let percent = if total > 0 {
                (read as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let _ = app.emit(
                "diff-progress",
                serde_json::json!({
                    "projectId": project_id,
                    "percent": percent,
                    "status": "Preparing"
                }),
            );
            last_progress_emit = std::time::Instant::now();
        }
    }

    let total = diffs.len() as u32;
    storage::save_diffs(project_id, &diffs)?;

    let _ = app.emit(
        "diff-progress",
        serde_json::json!({
            "projectId": project_id,
            "total": total,
            "settled": 0,
            "percent": 100.0,
            "status": "InProgress"
        }),
    );

    let projects = storage::load_projects()?;
    if let Some(mut p) = projects.into_iter().find(|p| p.id == project_id) {
        p.status = ProjectStatus::InProgress;
        p.total_diffs = total;
        p.settled_diffs = 0;
        p.updated_at = Utc::now();
        storage::update_project(&p)?;

        let _ = app.emit("project-updated", serde_json::json!({ "projectId": project_id }));
    }

    Ok(())
}

// ──────────────────────────────────────────────
// Element Helpers
// ──────────────────────────────────────────────

pub(crate) fn element_key(el: &Element) -> (ElementType, i64) {
    match el {
        Element::Node(n) => (ElementType::Node, n.id),
        Element::Way(w) => (ElementType::Way, w.id),
        Element::Relation(r) => (ElementType::Relation, r.id),
    }
}

fn element_order(el: &Element) -> (u8, i64) {
    match el {
        Element::Node(n) => (0, n.id),
        Element::Way(w) => (1, w.id),
        Element::Relation(r) => (2, r.id),
    }
}

/// Extract the author (OSM user name) of an element, if present.
fn element_author(el: &Element) -> Option<String> {
    let user = match el {
        Element::Node(n) => n.user.as_ref(),
        Element::Way(w) => w.user.as_ref(),
        Element::Relation(r) => r.user.as_ref(),
    };
    user.map(|u| u.name.clone())
}

fn elements_equal(a: &Element, b: &Element) -> bool {
    match (a, b) {
        (Element::Node(aa), Element::Node(bb)) => aa == bb,
        (Element::Way(aa), Element::Way(bb)) => aa == bb,
        (Element::Relation(aa), Element::Relation(bb)) => aa == bb,
        _ => false,
    }
}

// ──────────────────────────────────────────────
// Diff List & Settlement Commands
// ──────────────────────────────────────────────

const DEFAULT_PAGE_SIZE: u32 = 100;
const MAX_PAGE_SIZE: u32 = 1000;

/// Normalize a frontend filter value ("node" / "way" / "relation", case-insensitive) into the
/// canonical stored form ("Node" / "Way" / "Relation").
fn normalize_element_type(v: &str) -> Option<&'static str> {
    match v.to_lowercase().as_str() {
        "node" => Some("Node"),
        "way" => Some("Way"),
        "relation" => Some("Relation"),
        _ => None,
    }
}

/// Normalize a frontend diff-type value ("added" / "removed" / "modified") into the canonical
/// stored form ("Added" / "Removed" / "Modified").
fn normalize_diff_type(v: &str) -> Option<&'static str> {
    match v.to_lowercase().as_str() {
        "added" => Some("Added"),
        "removed" => Some("Removed"),
        "modified" => Some("Modified"),
        _ => None,
    }
}

#[tauri::command]
pub fn list_diffs(
    project_id: u32,
    filter: Option<DiffFilter>,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Result<PagedData<DiffItem>, String> {
    let mut filter = filter.unwrap_or(DiffFilter {
        element_type: None,
        diff_type: None,
        only_unsettled: None,
        element_id: None,
    });
    // Normalize enum filters to the canonical stored casing.
    filter.element_type = filter
        .element_type
        .as_deref()
        .and_then(normalize_element_type)
        .map(String::from);
    filter.diff_type = filter
        .diff_type
        .as_deref()
        .and_then(normalize_diff_type)
        .map(String::from);

    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE);
    let offset = ((page - 1) as i64) * (page_size as i64);

    let (items, total) =
        storage::list_diffs_page(project_id, &filter, page_size as i64, offset)
            .map_err(|e| e.to_string())?;
    Ok(PagedData {
        data: items,
        total,
    })
}

#[tauri::command]
pub fn settle_diff(
    app: tauri::AppHandle,
    project_id: u32,
    diff_id: u32,
    request: SettleDiffRequest,
) -> Result<(), String> {
    let settlement = match request.settlement.as_str() {
        "Source" => Settlement::Source,
        "Target" => Settlement::Target,
        "Custom" => Settlement::Custom,
        _ => return Err(format!("Invalid settlement: {}", request.settlement)),
    };

    // Verify the diff exists before updating.
    let existing = storage::get_diff(project_id, diff_id).map_err(|e| e.to_string())?;
    if existing.is_none() {
        return Err(format!("Diff {} not found in project {}", diff_id, project_id));
    }

    storage::update_diff_settlement(project_id, diff_id, Some(settlement), request.result)
        .map_err(|e| e.to_string())?;

    let settled = storage::count_settled_diffs(project_id).map_err(|e| e.to_string())?;
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    if let Some(mut p) = projects.into_iter().find(|p| p.id == project_id) {
        p.settled_diffs = settled;
        p.updated_at = Utc::now();
        storage::update_project(&p).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("project-updated", serde_json::json!({ "projectId": project_id }));
    Ok(())
}

#[tauri::command]
pub fn get_diff_detail(project_id: u32, diff_id: u32) -> Result<DiffDetail, String> {
    let diff = storage::get_diff(project_id, diff_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Diff {} not found in project {}", diff_id, project_id))?;

    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    let project = projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project {} not found", project_id))?;

    let mut source_reader = IndexedReader::from_path(&project.source_path)
        .map_err(|e| format!("Failed to open source PBF: {}", e))?;
    let mut target_reader = IndexedReader::from_path(&project.target_path)
        .map_err(|e| format!("Failed to open target PBF: {}", e))?;

    let pbf_element_type: pbf_craft::models::ElementType = diff.element_type.into();
    let source_elements = source_reader
        .get_with_deps(&pbf_element_type, diff.element_id)
        .unwrap_or_default();
    let target_elements = target_reader
        .get_with_deps(&pbf_element_type, diff.element_id)
        .unwrap_or_default();

    Ok(DiffDetail {
        id: diff.id,
        project_id,
        element_type: diff.element_type,
        element_id: diff.element_id,
        diff_type: diff.diff_type,
        settlement: diff.settlement,
        result: diff.result,
        source: source_elements,
        target: target_elements,
        related: Vec::new(),
    })
}
