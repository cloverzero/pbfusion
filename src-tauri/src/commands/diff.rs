use chrono::Utc;
use pbf_craft::models::Element;
use pbf_craft::readers::{IndexedReader, IterableReader};
use tauri::Emitter;

use crate::models::{
    DiffDetail, DiffFilter, DiffItem, DiffType, ElementType, ProjectStatus, Settlement,
    SettleDiffRequest,
};
use crate::storage;

// ──────────────────────────────────────────────
// Diff Analysis
// ──────────────────────────────────────────────

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
                        });
                        diff_id += 1;
                        target_next = target_iter.next();
                    }
                }
            }
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

#[tauri::command]
pub fn list_diffs(project_id: u32, filter: Option<DiffFilter>) -> Result<Vec<DiffItem>, String> {
    let diffs = storage::load_diffs(project_id).map_err(|e| e.to_string())?;
    if let Some(f) = filter {
        let diffs: Vec<DiffItem> = diffs
            .into_iter()
            .filter(|d| {
                if let Some(ref et) = f.element_type {
                    let et_lower = et.to_lowercase();
                    let want = match et_lower.as_str() {
                        "node" => ElementType::Node,
                        "way" => ElementType::Way,
                        "relation" => ElementType::Relation,
                        _ => return true,
                    };
                    if d.element_type != want {
                        return false;
                    }
                }
                if let Some(ref dt) = f.diff_type {
                    let dt_lower = dt.to_lowercase();
                    let want = match dt_lower.as_str() {
                        "added" => DiffType::Added,
                        "removed" => DiffType::Removed,
                        "modified" => DiffType::Modified,
                        _ => return true,
                    };
                    if d.diff_type != want {
                        return false;
                    }
                }
                if f.only_unsettled.unwrap_or(false) && d.settlement.is_some() {
                    return false;
                }
                if let Some(eid) = f.element_id {
                    if d.element_id != eid {
                        return false;
                    }
                }
                true
            })
            .collect();
        Ok(diffs)
    } else {
        Ok(diffs)
    }
}

#[tauri::command]
pub fn settle_diff(
    app: tauri::AppHandle,
    project_id: u32,
    diff_id: u32,
    request: SettleDiffRequest,
) -> Result<(), String> {
    let mut diffs = storage::load_diffs(project_id).map_err(|e| e.to_string())?;
    let diff = diffs
        .iter_mut()
        .find(|d| d.id == diff_id)
        .ok_or_else(|| format!("Diff {} not found in project {}", diff_id, project_id))?;

    diff.settlement = match request.settlement.as_str() {
        "Source" => Some(Settlement::Source),
        "Target" => Some(Settlement::Target),
        "Custom" => Some(Settlement::Custom),
        _ => return Err(format!("Invalid settlement: {}", request.settlement)),
    };
    if let Some(result) = request.result {
        diff.result = Some(result);
    }

    storage::save_diffs(project_id, &diffs).map_err(|e| e.to_string())?;

    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    if let Some(mut p) = projects.into_iter().find(|p| p.id == project_id) {
        let settled = diffs.iter().filter(|d| d.settlement.is_some()).count() as u32;
        p.settled_diffs = settled;
        p.updated_at = Utc::now();
        storage::update_project(&p).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("project-updated", serde_json::json!({ "projectId": project_id }));
    Ok(())
}

#[tauri::command]
pub fn get_diff_detail(project_id: u32, diff_id: u32) -> Result<DiffDetail, String> {
    let diffs = storage::load_diffs(project_id).map_err(|e| e.to_string())?;
    let diff = diffs
        .iter()
        .find(|d| d.id == diff_id)
        .ok_or_else(|| format!("Diff {} not found in project {}", diff_id, project_id))?
        .clone();

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
