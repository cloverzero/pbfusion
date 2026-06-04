"use client";

import { useMemo, useCallback } from "react";
import { DiffEditor, type Monaco } from "@monaco-editor/react";
import type { OSMElement } from "@/lib/types";

// ── Props ──

interface JsonDiffProps {
  sourceElements: OSMElement[];
  targetElements: OSMElement[];
  elementType: string;
  elementId: number;
}

// ── JSON serialization helpers ──

/**
 * Clean a raw pbf-craft element into a display-friendly JSON object.
 * Strips verbose fields and normalizes structures.
 */
function cleanElement(el: OSMElement): Record<string, unknown> {
  const tagsArr = Array.isArray(el.tags) ? el.tags : [];
  const base = {
    type: el.type,
    id: el.id,
    version: el.version,
    timestamp: el.timestamp,
    user: el.user,
    changesetId: el.changeset_id,
    tags: tagsArr.length > 0 ? Object.fromEntries(tagsArr.map((t) => [t.key, t.value])) : {},
  };

  switch (el.type) {
    case "Node":
      return {
        ...base,
        latitude: el.latitude,
        longitude: el.longitude,
      };
    case "Way":
      return {
        ...base,
        wayNodes: Array.isArray(el.way_nodes) ? el.way_nodes.map((wn) => wn.id) : [],
      };
    case "Relation":
      return {
        ...base,
        members: Array.isArray(el.members)
          ? el.members.map((m) => ({
              id: m.member_id,
              type: m.member_type,
              role: m.role,
            }))
          : [],
      };
    default:
      return base;
  }
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// ── Component ──

export function JsonDiff({
  sourceElements,
  targetElements,
  elementType,
  elementId,
}: JsonDiffProps) {
  // Find the primary element on each side
  const sourceEl = useMemo(
    () => sourceElements.find(
      (e) => e && e.type?.toLowerCase() === elementType.toLowerCase() && e.id === elementId,
    ),
    [sourceElements, elementType, elementId],
  );
  const targetEl = useMemo(
    () => targetElements.find(
      (e) => e && e.type?.toLowerCase() === elementType.toLowerCase() && e.id === elementId,
    ),
    [targetElements, elementType, elementId],
  );

  const sourceJson = sourceEl ? formatJson(cleanElement(sourceEl)) : "";
  const targetJson = targetEl ? formatJson(cleanElement(targetEl)) : "";

  const handleMount = useCallback((_editor: unknown, monaco: Monaco) => {
    // Compact diff experience: hide unchanged regions
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
    });
  }, []);

  if (!sourceEl && !targetEl) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        No element data available
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0">
      <DiffEditor
        height="100%"
        language="json"
        original={sourceJson}
        modified={targetJson}
        onMount={handleMount}
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          folding: true,
          renderOverviewRuler: false,
          automaticLayout: true,
          fontSize: 12,
          lineHeight: 18,
          padding: { top: 8, bottom: 8 },
          originalEditable: false,
          // hide unchanged regions for cleaner diff view
          diffWordWrap: "on",
          ignoreTrimWhitespace: false,
          renderIndicators: true,
        }}
        theme="vs-dark"
      />
    </div>
  );
}
