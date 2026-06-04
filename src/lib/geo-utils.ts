/**
 * Geometry utilities for extracting map-ready coordinates from pbf-craft Element arrays.
 *
 * Since `get_with_deps` returns the primary element plus its dependency nodes,
 * we can build full geometries for all element types.
 *
 * All type comparisons are case-INsensitive to handle serde serialization variance.
 * Field names are snake_case to match pbf-craft's serde output.
 */

import type {
  OSMElement,
  NodeElement,
  WayElement,
  RelationElement,
} from "@/lib/types";

// ── Types ──

export interface PointGeometry {
  type: "Point";
  coordinates: [number, number]; // [lon, lat] in degrees
}

export interface LineGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface MultiLineGeometry {
  type: "MultiLineString";
  coordinates: [number, number][][];
}

export type ElementGeometry = PointGeometry | LineGeometry | MultiLineGeometry | null;

// ── Helpers ──

const NANO = 1_000_000_000;

function toDegrees(nanodegrees: number): number {
  if (nanodegrees == null || !isFinite(nanodegrees)) return 0;
  return nanodegrees / NANO;
}

/** Case-insensitive type equality. */
function typeIs(el: { type?: string } | null | undefined, want: string): boolean {
  if (!el || !el.type) return false;
  return el.type.toLowerCase() === want.toLowerCase();
}

/**
 * Build a node-id → {lat, lon} lookup from all Node elements in an array.
 */
function buildNodeCoordMap(elements: OSMElement[]): Map<number, { lat: number; lon: number }> {
  const map = new Map<number, { lat: number; lon: number }>();
  if (!Array.isArray(elements)) return map;

  for (const el of elements) {
    if (!el) continue;
    if (!typeIs(el, "Node")) continue;
    const node = el as NodeElement;
    if (node.id == null) continue;
    map.set(node.id, {
      lat: toDegrees(node.latitude),
      lon: toDegrees(node.longitude),
    });
  }
  return map;
}

/**
 * Find an element in the array matching type and id.
 */
function findElement<T extends OSMElement>(
  elements: OSMElement[],
  wantType: string,
  wantId: number,
): T | undefined {
  if (!Array.isArray(elements)) return undefined;
  for (const el of elements) {
    if (!el) continue;
    if (typeIs(el, wantType) && el.id === wantId) {
      return el as T;
    }
  }
  return undefined;
}

// ── Geometry Extraction ──

/**
 * Extract the geometry for a specific element from a full element set (including deps).
 * Returns null if no geometry can be determined.
 */
export function extractGeometry(
  elements: OSMElement[],
  elementType: string,
  elementId: number,
): ElementGeometry {
  if (!Array.isArray(elements)) return null;
  if (!elementType || elementId == null) return null;

  const nodeCoords = buildNodeCoordMap(elements);
  const etype = elementType.toLowerCase();

  try {
    if (etype === "node") {
      const el = findElement<NodeElement>(elements, "node", elementId);
      if (!el || el.latitude == null || el.longitude == null) return null;
      return {
        type: "Point",
        coordinates: [toDegrees(el.longitude), toDegrees(el.latitude)],
      };
    }

    if (etype === "way") {
      const el = findElement<WayElement>(elements, "way", elementId);
      if (!el) return null;
      const wayNodes = el.way_nodes;
      if (!Array.isArray(wayNodes) || wayNodes.length === 0) return null;

      const coords: [number, number][] = [];
      for (const wn of wayNodes) {
        if (!wn) continue;
        if (wn.latitude != null && wn.longitude != null) {
          coords.push([toDegrees(wn.longitude), toDegrees(wn.latitude)]);
        } else {
          const node = nodeCoords.get(wn.id);
          if (node) {
            coords.push([node.lon, node.lat]);
          }
        }
      }
      if (coords.length === 0) return null;
      return {
        type: "LineString",
        coordinates: coords,
      };
    }

    if (etype === "relation") {
      const el = findElement<RelationElement>(elements, "relation", elementId);
      if (!el) return null;
      const members = el.members;
      if (!Array.isArray(members)) return null;

      const lines: [number, number][][] = [];
      for (const member of members) {
        if (!member) continue;
        const mtype = (member.member_type || "").toLowerCase();
        if (mtype === "way") {
          const wayGeom = extractGeometry(elements, "Way", member.member_id);
          if (wayGeom && wayGeom.type === "LineString") {
            lines.push(wayGeom.coordinates);
          }
        }
        if (mtype === "node") {
          const node = nodeCoords.get(member.member_id);
          if (node) {
            lines.push([[node.lon, node.lat]]);
          }
        }
      }
      if (lines.length === 0) return null;
      return {
        type: "MultiLineString",
        coordinates: lines,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the bounding box for a geometry. Returns [minLon, minLat, maxLon, maxLat].
 */
export function geometryBbox(geom: ElementGeometry): [number, number, number, number] | null {
  if (!geom) return null;

  let allCoords: [number, number][] = [];
  switch (geom.type) {
    case "Point":
      allCoords = [geom.coordinates];
      break;
    case "LineString":
      allCoords = geom.coordinates;
      break;
    case "MultiLineString":
      allCoords = geom.coordinates.flat();
      break;
    default:
      return null;
  }

  if (allCoords.length === 0) return null;

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const coord of allCoords) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const [lon, lat] = coord;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  if (!isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Compute the center point of a geometry.
 */
export function geometryCenter(geom: ElementGeometry): [number, number] | null {
  const bbox = geometryBbox(geom);
  if (!bbox) return null;
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}
