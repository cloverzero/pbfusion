// Mirrors Rust models in src-tauri/src/models.rs
// Element shapes mirror pbf-craft models (tagged enum via serde).
//
// IMPORTANT: pbf-craft structs do NOT use #[serde(rename_all)]; fields are snake_case.
// The outer DiffDetail uses camelCase, but inner elements use snake_case.
// Frontend types MUST match the actual JSON field names.

export type ProjectStatus = "Preparing" | "InProgress" | "Completed" | "Failed";

export interface Project {
  id: number;
  name: string;
  sourcePath: string;
  targetPath: string;
  outputPath?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  totalDiffs: number;
  settledDiffs: number;
}

export type ElementType = "Node" | "Way" | "Relation";
export type DiffType = "Added" | "Removed" | "Modified";
export type Settlement = "Source" | "Target" | "Custom";

export interface DiffItem {
  id: number;
  projectId: number;
  elementType: ElementType;
  elementId: number;
  diffType: DiffType;
  settlement?: Settlement;
  result?: string;
}

export interface CreateProjectRequest {
  name: string;
  sourcePath: string;
  targetPath: string;
}

export interface DiffProgress {
  projectId: number;
  total: number;
  settled: number;
  status: string;
}

export interface ProjectUpdated {
  projectId: number;
}

export interface DiffFilter {
  elementType?: string;
  diffType?: string;
  onlyUnsettled?: boolean;
  elementId?: number;
}

export interface SettleDiffRequest {
  settlement: string;
  result?: string;
}

// ─── OSM Element shapes (mirrors pbf-craft::models) ───
//
// Field names are snake_case to match pbf-craft's serde output.
// Elements are tagged: { "type": "Node", ... }

export interface Tag {
  key: string;
  value: string;
}

export interface OsmUser {
  id: number;
  name: string;
}

/** WayNode from pbf-craft — coordinates are optional (populated when reading with deps). */
export interface WayNode {
  id: number;
  latitude: number | null;
  longitude: number | null;
}

export interface RelationMember {
  member_id: number;
  member_type: string; // "Node" | "Way" | "Relation"
  role: string;
}

// pbf-craft Element is serialized as a tagged enum: { "type": "Node", ... }
export type OSMElement = NodeElement | WayElement | RelationElement;

interface ElementBase {
  id: number;
  version: number;
  timestamp: string | null;
  user: OsmUser | null;
  changeset_id: number;
  visible: boolean;
  tags: Tag[];
}

export interface NodeElement extends ElementBase {
  type: "Node";
  latitude: number;  // nanodegrees (÷ 1e9 for degrees)
  longitude: number; // nanodegrees
}

export interface WayElement extends ElementBase {
  type: "Way";
  way_nodes: WayNode[];
}

export interface RelationElement extends ElementBase {
  type: "Relation";
  members: RelationMember[];
}

// ─── Diff Detail ───

export interface DiffDetail {
  id: number;
  projectId: number;
  elementType: ElementType;
  elementId: number;
  diffType: DiffType;
  settlement?: Settlement;
  result?: string;
  source: OSMElement[];
  target: OSMElement[];
  related: DiffItem[];
}

// ─── App Settings ───

export interface AppSettings {
  homeDir: string;
  exportDir: string;
}

export interface UpdateSettingsRequest {
  homeDir?: string;
  exportDir?: string;
}
