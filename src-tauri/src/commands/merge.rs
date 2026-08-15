use std::fs;
use std::io::BufReader;

use chrono::Utc;
use pbf_craft::models::{Element, ElementType as PbfElementType};
use pbf_craft::readers::{IndexedReader, IterableReader, PbfReader};
use pbf_craft::writers::PbfWriter;
use tauri::Emitter;

use crate::background::{BackgroundTaskKind, BackgroundTaskState};
use crate::models::{DiffItem, Project, ProjectStatus, Settlement};
use crate::storage;

use super::diff::element_key;

// ──────────────────────────────────────────────
// Merge Export Command
// ──────────────────────────────────────────────

/// How often (in milliseconds) a `merge-progress` event may be emitted at most.
const PROGRESS_EMIT_INTERVAL_MS: u128 = 250;

/// Validates the project and spawns the merge as a background task.
///
/// Returns immediately after validation; actual merging runs on a background thread and
/// reports progress via `merge-progress` events. On completion a `project-updated` event is
/// emitted so the frontend can refresh the project.
#[tauri::command]
pub fn merge_export(
    app: tauri::AppHandle,
    project_id: u32,
    state: tauri::State<'_, BackgroundTaskState>,
) -> Result<(), String> {
    // 1. Load project and diffs (fast, synchronous validation)
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    let project = projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project {} not found", project_id))?
        .clone();

    let diffs = storage::load_diffs(project_id).map_err(|e| e.to_string())?;

    // 2. Guard: every diff must be settled
    let unsettled: Vec<&DiffItem> = diffs.iter().filter(|d| d.settlement.is_none()).collect();
    if !unsettled.is_empty() {
        return Err(format!(
            "Project has {} unsettled diff(s); settle all diffs before merging. \
             First unsettled: diff#{}, element_type={:?}, element_id={}",
            unsettled.len(),
            unsettled[0].id,
            unsettled[0].element_type,
            unsettled[0].element_id,
        ));
    }

    if diffs.is_empty() {
        return Err("No diffs to merge".into());
    }

    // 3. Register background task and spawn the actual merge.
    let project_name = project.name.clone();
    state.start(BackgroundTaskKind::Merge, project_id, &project_name);
    let app_handle = app.clone();
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let result = run_merge(&app_handle, project_id);
        state_clone.finish(BackgroundTaskKind::Merge, project_id);
        if let Err(e) = result {
            let _ = app_handle.emit(
                "merge-progress",
                serde_json::json!({
                    "projectId": project_id,
                    "percent": 0.0,
                    "status": "Failed",
                    "message": e
                }),
            );
        }
    });

    Ok(())
}

/// The actual merge work, run on a background thread.
///
/// Emits `merge-progress` events (throttled) while scanning the source stream, a final
/// `merge-progress` with status `Completed`, and a `project-updated` event when the project
/// record is updated.
fn run_merge(app: &tauri::AppHandle, project_id: u32) -> Result<Project, String> {
    // 1. Load project and diffs
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    let project = projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project {} not found", project_id))?
        .clone();

    let diffs = storage::load_diffs(project_id).map_err(|e| e.to_string())?;

    // 2. Sort diffs
    let mut sorted_diffs = diffs;
    sorted_diffs.sort_by_key(|d| d.sort_key());
    let total_diffs = sorted_diffs.len();

    // 3. Open readers
    let source = IterableReader::from_path(&project.source_path)
        .map_err(|e| format!("Failed to open source PBF: {}", e))?;
    let mut target = IndexedReader::from_path(&project.target_path)
        .map_err(|e| format!("Failed to open target PBF: {}", e))?;

    // 4. Prepare writer
    let out_dir = storage::export_dir().join(project_id.to_string());
    fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    let output_path = out_dir.join("merged.pbf");
    let mut writer = PbfWriter::from_path(&output_path, true)
        .map_err(|e| format!("Failed to create PbfWriter: {}", e))?;

    // 4.1 Helper closures
    type TargetReader = IndexedReader<PbfReader<BufReader<std::fs::File>>>;

    let resolve_element =
        |src_el: &Element, diff: &DiffItem, target: &mut TargetReader|
         -> Result<Option<Element>, String> {
            match diff.settlement.as_ref().unwrap() {
                Settlement::Source => Ok(Some(src_el.clone())),
                Settlement::Target => {
                    let (et, eid) = element_key(src_el);
                    let pbf_et: PbfElementType = et.into();
                    match IndexedReader::find(target, &pbf_et, eid) {
                        Ok(el) => Ok(el),
                        Err(_) => Ok(None),
                    }
                }
                Settlement::Custom => diff
                    .get_custom_element()
                    .ok_or_else(|| {
                        format!(
                            "Custom settlement for diff#{} has no valid element in result field",
                            diff.id
                        )
                    })
                    .map(Some),
            }
        };

    let resolve_added =
        |diff: &DiffItem, target: &mut TargetReader| -> Result<Option<Element>, String> {
            match diff.settlement.as_ref().unwrap() {
                Settlement::Source => Ok(None),
                Settlement::Target => {
                    let pbf_et: PbfElementType = diff.element_type.into();
                    IndexedReader::find(target, &pbf_et, diff.element_id)
                        .map_err(|e| format!("Failed to find element in target: {}", e))
                }
                Settlement::Custom => diff
                    .get_custom_element()
                    .ok_or_else(|| {
                        format!("Custom settlement for diff#{} has no valid element", diff.id)
                    })
                    .map(Some),
            }
        };

    // 5. Dual-cursor merge with throttled progress reporting
    let mut source_iter = source.into_iter();
    let mut source_next = source_iter.next();
    let mut diff_idx = 0usize;
    let mut last_progress_emit = std::time::Instant::now();

    loop {
        match (&source_next, sorted_diffs.get(diff_idx)) {
            (Some(src_el), Some(diff)) => {
                let src_type: PbfElementType = diff.element_type.into();
                match (src_el, &src_type) {
                    _ if element_key(src_el).0 == diff.element_type => {
                        let (_et, src_id) = element_key(src_el);
                        if src_id == diff.element_id {
                            let content = resolve_element(src_el, diff, &mut target)?;
                            if let Some(el) = content {
                                writer.write(el).map_err(|e| format!("Write error: {}", e))?;
                            }
                            source_next = source_iter.next();
                            diff_idx += 1;
                        } else if src_id < diff.element_id {
                            writer
                                .write(src_el.clone())
                                .map_err(|e| format!("Write error: {}", e))?;
                            source_next = source_iter.next();
                        } else {
                            let content = resolve_added(diff, &mut target)?;
                            if let Some(el) = content {
                                writer.write(el).map_err(|e| format!("Write error: {}", e))?;
                            }
                            diff_idx += 1;
                        }
                    }
                    (Element::Node(_), PbfElementType::Way)
                    | (Element::Node(_), PbfElementType::Relation)
                    | (Element::Way(_), PbfElementType::Relation) => {
                        writer
                            .write(src_el.clone())
                            .map_err(|e| format!("Write error: {}", e))?;
                        source_next = source_iter.next();
                    }
                    _ => {
                        let content = resolve_added(diff, &mut target)?;
                        if let Some(el) = content {
                            writer.write(el).map_err(|e| format!("Write error: {}", e))?;
                        }
                        diff_idx += 1;
                    }
                }
            }
            (Some(src_el), None) => {
                writer
                    .write(src_el.clone())
                    .map_err(|e| format!("Write error: {}", e))?;
                source_next = source_iter.next();
            }
            (None, Some(diff)) => {
                let content = resolve_added(diff, &mut target)?;
                if let Some(el) = content {
                    writer.write(el).map_err(|e| format!("Write error: {}", e))?;
                }
                diff_idx += 1;
            }
            (None, None) => break,
        }

        // Throttled progress sampling (source stream is the dominant cost).
        if last_progress_emit.elapsed().as_millis() >= PROGRESS_EMIT_INTERVAL_MS {
            let p = source_iter.progress();
            let percent = match p.total_bytes {
                Some(t) if t > 0 => (p.bytes_read as f64 / t as f64) * 100.0,
                _ => 0.0,
            };
            let _ = app.emit(
                "merge-progress",
                serde_json::json!({
                    "projectId": project_id,
                    "percent": percent,
                    "processedDiffs": diff_idx,
                    "totalDiffs": total_diffs,
                    "status": "Merging"
                }),
            );
            last_progress_emit = std::time::Instant::now();
        }
    }

    writer
        .finish()
        .map_err(|e| format!("Failed to finish PBF: {}", e))?;

    // 6. Update project
    let projects = storage::load_projects().map_err(|e| e.to_string())?;
    if let Some(mut p) = projects.into_iter().find(|p| p.id == project_id) {
        p.status = ProjectStatus::Completed;
        p.output_path = Some(output_path.to_string_lossy().to_string());
        p.updated_at = Utc::now();
        storage::update_project(&p).map_err(|e| e.to_string())?;
        let _ = app.emit(
            "merge-progress",
            serde_json::json!({
                "projectId": project_id,
                "percent": 100.0,
                "processedDiffs": total_diffs,
                "totalDiffs": total_diffs,
                "status": "Completed"
            }),
        );
        let _ = app.emit(
            "project-updated",
            serde_json::json!({ "projectId": project_id }),
        );
        Ok(p)
    } else {
        Err(format!("Project {} disappeared during merge", project_id))
    }
}
