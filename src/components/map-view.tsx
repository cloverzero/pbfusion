"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  extractGeometry,
  geometryBbox,
  type ElementGeometry,
} from "@/lib/geo-utils";
import type { OSMElement } from "@/lib/types";

// ── Constants ──

const SOURCE_COLOR = "#3b82f6"; // blue-500
const TARGET_COLOR = "#ef4444"; // red-500
const SOURCE_FILL = "rgba(59, 130, 246, 0.15)";
const TARGET_FILL = "rgba(239, 68, 68, 0.15)";
const LINE_WIDTH = 3;
const CIRCLE_RADIUS = 6;

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ── Props ──

interface MapViewProps {
  sourceElements: OSMElement[];
  targetElements: OSMElement[];
  elementType: string;
  elementId: number;
}

// ── Component ──

export function MapView({
  sourceElements,
  targetElements,
  elementType,
  elementId,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Extract geometries
  const sourceGeom = extractGeometry(sourceElements, elementType, elementId);
  const targetGeom = extractGeometry(targetElements, elementType, elementId);

  const hasGeometry = sourceGeom !== null || targetGeom !== null;

  // ── Fit bounds helper ──
  const fitToGeometries = useCallback(
    (map: maplibregl.Map) => {
      const bounds = new maplibregl.LngLatBounds();

      const addGeom = (geom: ElementGeometry) => {
        if (!geom) return;
        const bbox = geometryBbox(geom);
        if (!bbox) return;
        bounds.extend([bbox[0], bbox[1]]);
        bounds.extend([bbox[2], bbox[3]]);
      };

      addGeom(sourceGeom);
      addGeom(targetGeom);

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 40,
          maxZoom: 17,
          duration: 0,
        });
      }
    },
    [sourceGeom, targetGeom],
  );

  // ── Init map ──
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [OSM_TILES],
            tileSize: 256,
            attribution: OSM_ATTRIBUTION,
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [0, 0],
      zoom: 1,
      attributionControl: false,
    });

    map.on("load", () => {
      // Add source geometry layer
      addGeometryLayer(map, "source-geom", sourceGeom, SOURCE_COLOR, SOURCE_FILL);
      // Add target geometry layer
      addGeometryLayer(map, "target-geom", targetGeom, TARGET_COLOR, TARGET_FILL);

      fitToGeometries(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // We intentionally run only on mount/unmount. Geometry updates are rare
    // and the user can re-select the diff to see new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceElements, targetElements, elementType, elementId]);

  // ── No geometry state ──
  if (!hasGeometry) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        No geographic data available for this {elementType.toLowerCase()}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur border rounded-md px-3 py-1.5 text-xs shadow-sm flex items-center gap-4 z-10">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: SOURCE_COLOR }}
          />
          Source
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: TARGET_COLOR }}
          />
          Target
        </span>
      </div>
    </div>
  );
}

// ── Layer helpers ──

function addGeometryLayer(
  map: maplibregl.Map,
  id: string,
  geom: ElementGeometry,
  color: string,
  _fillColor: string,
) {
  if (!geom) return;

  switch (geom.type) {
    case "Point": {
      map.addSource(`${id}-src`, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: geom.coordinates },
          properties: {},
        },
      });
      map.addLayer({
        id: `${id}-circle`,
        type: "circle",
        source: `${id}-src`,
        paint: {
          "circle-radius": CIRCLE_RADIUS,
          "circle-color": color,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      break;
    }
    case "LineString": {
      map.addSource(`${id}-src`, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: geom.coordinates },
          properties: {},
        },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: `${id}-src`,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": color,
          "line-width": LINE_WIDTH,
        },
      });
      break;
    }
    case "MultiLineString": {
      map.addSource(`${id}-src`, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "MultiLineString", coordinates: geom.coordinates },
          properties: {},
        },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: `${id}-src`,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": color,
          "line-width": LINE_WIDTH,
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: `${id}-fill`,
        type: "fill",
        source: `${id}-src`,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.08,
        },
      });
      break;
    }
  }
}
