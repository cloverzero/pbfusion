import { invoke } from "@tauri-apps/api/core";
import type {
  Project, CreateProjectRequest, DiffItem, DiffFilter,
  SettleDiffRequest, DiffDetail,
} from "./types";

// ── Projects ──

export async function listProjects(search?: string): Promise<Project[]> {
  return invoke("list_projects", {
    params: search ? { search } : null,
  });
}

export async function getProject(id: number): Promise<Project> {
  return invoke("get_project", { id });
}

export async function createProject(request: CreateProjectRequest): Promise<Project> {
  return invoke("create_project", { request });
}

export async function deleteProject(id: number): Promise<void> {
  return invoke("delete_project", { id });
}

// ── Diffs ──

export async function listDiffs(
  projectId: number,
  filter?: DiffFilter,
): Promise<DiffItem[]> {
  return invoke("list_diffs", { projectId, filter: filter || null });
}

export async function settleDiff(
  projectId: number,
  diffId: number,
  request: SettleDiffRequest,
): Promise<void> {
  return invoke("settle_diff", { projectId, diffId, request });
}

export async function getDiffDetail(
  projectId: number,
  diffId: number,
): Promise<DiffDetail> {
  return invoke("get_diff_detail", { projectId, diffId });
}
