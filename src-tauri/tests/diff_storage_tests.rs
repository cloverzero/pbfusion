//! Integration tests for the SQLite-backed diff storage layer.
//!
//! These tests do not touch the Tauri runtime; they exercise `storage.rs` directly against a
//! temp HOME so nothing leaks into the user's real ~/.pbfusion.

use std::fs;
use std::sync::Mutex;

use pbfusion_lib::models::{DiffFilter, DiffItem, DiffType, ElementType, Settlement};

/// `storage` resolves the data dir from the global `HOME` env var, so tests that mutate it
/// must not run concurrently.
static HOME_LOCK: Mutex<()> = Mutex::new(());

/// Point HOME at a fresh temp dir so `storage` uses an isolated data directory.
/// Serialize a test against the shared HOME environment.
fn with_isolated_home<T>(f: impl FnOnce() -> T) -> T {
    let _guard = HOME_LOCK.lock().unwrap();
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().to_str().unwrap().to_string();
    std::env::set_var("HOME", &home);
    std::env::set_var("USERPROFILE", &home);
    f()
}

fn sample_diff(id: u32, project_id: u32, et: ElementType, eid: i64, dt: DiffType) -> DiffItem {
    DiffItem {
        id,
        project_id,
        element_type: et,
        element_id: eid,
        diff_type: dt,
        settlement: None,
        result: None,
        source_author: Some("alice".into()),
        target_author: None,
    }
}

#[test]
fn save_and_page_diffs() {
    with_isolated_home(|| {

    let mut diffs = Vec::new();
    for i in 1..=250u32 {
        diffs.push(sample_diff(i, 1, ElementType::Node, i as i64, DiffType::Modified));
    }
    pbfusion_lib::storage::save_diffs(1, &diffs).expect("save diffs");

    // Page 1: 100 items, total 250.
    let (page1, total) = pbfusion_lib::storage::list_diffs_page(
        1,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("page 1");
    assert_eq!(total, 250);
    assert_eq!(page1.len(), 100);
    assert_eq!(page1[0].id, 1);
    assert_eq!(page1[99].id, 100);

    // Page 3: items 201..=250.
    let (page3, _) = pbfusion_lib::storage::list_diffs_page(
        1,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        200,
    )
    .expect("page 3");
    assert_eq!(page3.len(), 50);
    assert_eq!(page3[0].id, 201);

    // Filters: element_type.
    let (filtered, filtered_total) = pbfusion_lib::storage::list_diffs_page(
        1,
        &DiffFilter {
            element_type: Some("Node".into()),
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("filter type");
    assert_eq!(filtered_total, 250);
    assert_eq!(filtered.len(), 100);

    // Count with filter.
    let count = pbfusion_lib::storage::count_diffs(
        1,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: Some(true),
            element_id: None,
        },
    )
    .expect("count unsettled");
    assert_eq!(count, 250);

    // get_diff
    let d = pbfusion_lib::storage::get_diff(1, 42).expect("get diff").expect("some");
    assert_eq!(d.id, 42);
    assert_eq!(d.project_id, 1);
    assert_eq!(d.element_id, 42);
    assert_eq!(d.settlement, None);

    });
}

#[test]
fn settle_updates_single_row() {
    with_isolated_home(|| {

    let mut diffs = Vec::new();
    for i in 1..=10u32 {
        diffs.push(sample_diff(i, 2, ElementType::Way, i as i64, DiffType::Added));
    }
    pbfusion_lib::storage::save_diffs(2, &diffs).expect("save diffs");

    pbfusion_lib::storage::update_diff_settlement(2, 5, Some(Settlement::Target), None)
        .expect("settle");

    let d = pbfusion_lib::storage::get_diff(2, 5).expect("get").expect("some");
    assert_eq!(d.settlement, Some(Settlement::Target));

    let settled = pbfusion_lib::storage::count_settled_diffs(2).expect("count settled");
    assert_eq!(settled, 1);

    // Other rows untouched.
    let other = pbfusion_lib::storage::get_diff(2, 6).expect("get").expect("some");
    assert_eq!(other.settlement, None);

    // Unsettled-only filter now returns 9.
    let count = pbfusion_lib::storage::count_diffs(
        2,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: Some(true),
            element_id: None,
        },
    )
    .expect("count");
    assert_eq!(count, 9);

    });
}

#[test]
fn projects_are_isolated() {
    with_isolated_home(|| {

    let mut a = Vec::new();
    for i in 1..=5u32 {
        a.push(sample_diff(i, 10, ElementType::Node, i as i64, DiffType::Modified));
    }
    pbfusion_lib::storage::save_diffs(10, &a).expect("save project 10");

    let mut b = Vec::new();
    for i in 1..=3u32 {
        b.push(sample_diff(i, 11, ElementType::Relation, i as i64, DiffType::Removed));
    }
    pbfusion_lib::storage::save_diffs(11, &b).expect("save project 11");

    let (items10, total10) = pbfusion_lib::storage::list_diffs_page(
        10,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("p10");
    assert_eq!(total10, 5);
    assert_eq!(items10[0].project_id, 10);

    let (items11, total11) = pbfusion_lib::storage::list_diffs_page(
        11,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("p11");
    assert_eq!(total11, 3);
    assert_eq!(items11[0].project_id, 11);
    assert_eq!(items11[0].element_type, ElementType::Relation);

    // Deleting project 10 must not affect project 11.
    pbfusion_lib::storage::delete_project(10).expect("delete p10");
    let (_, total11_after) = pbfusion_lib::storage::list_diffs_page(
        11,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("p11 after");
    assert_eq!(total11_after, 3);

    });
}

#[test]
fn empty_filter_matches_all_and_load_all_orders_by_id() {
    with_isolated_home(|| {
    let mut diffs = Vec::new();
    for i in 1..=20u32 {
        diffs.push(sample_diff(i, 3, ElementType::Node, i as i64, DiffType::Added));
    }
    pbfusion_lib::storage::save_diffs(3, &diffs).expect("save");

    let all = pbfusion_lib::storage::load_all_diffs(3).expect("load all");
    assert_eq!(all.len(), 20);
    for (idx, d) in all.iter().enumerate() {
        assert_eq!(d.id as usize, idx + 1);
    }

    let first_unsettled = pbfusion_lib::storage::first_unsettled_diff(3).expect("first");
    assert_eq!(first_unsettled.map(|d| d.id), Some(1));

    // Database file exists under the per-project diffs dir.
    let db_path = dirs_home().join(".pbfusion/diffs/3/diffs.db");
    assert!(db_path.exists(), "expected diffs.db at {}", db_path.display());

    // Remove leftover files so tempdir cleanup is clean.
    let _ = fs::remove_file(db_path);

    });
}

#[test]
fn batched_inserts_preserve_all_rows() {
    with_isolated_home(|| {
    // Simulate diff analysis flushing in batches (e.g. 10k at a time) across a large result.
    let batch_size = 10_000usize;
    let total_rows = 25_000u32;

    for start in (1..=total_rows).step_by(batch_size) {
        let end = (start + batch_size as u32 - 1).min(total_rows);
        let batch: Vec<DiffItem> = (start..=end)
            .map(|i| sample_diff(i, 9, ElementType::Node, i as i64, DiffType::Modified))
            .collect();
        pbfusion_lib::storage::insert_diffs_batch(9, &batch).expect("insert batch");
    }

    let all = pbfusion_lib::storage::load_all_diffs(9).expect("load all");
    assert_eq!(all.len(), total_rows as usize);
    // Ids remain contiguous and ordered across batches.
    for (idx, d) in all.iter().enumerate() {
        assert_eq!(d.id as usize, idx + 1);
        assert_eq!(d.element_id, d.id as i64);
    }

    let count = pbfusion_lib::storage::count_diffs(
        9,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
    )
    .expect("count");
    assert_eq!(count, total_rows as i64);

    // Empty batch is a no-op.
    pbfusion_lib::storage::insert_diffs_batch(9, &[]).expect("empty batch ok");
    let (_, total_after) = pbfusion_lib::storage::list_diffs_page(
        9,
        &DiffFilter {
            element_type: None,
            diff_type: None,
            only_unsettled: None,
            element_id: None,
        },
        100,
        0,
    )
    .expect("page");
    assert_eq!(total_after, total_rows as i64);

    });
}

fn dirs_home() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
}
