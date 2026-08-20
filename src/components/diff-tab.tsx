"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search, Filter, CheckCircle, X, ArrowLeftRight,
  Map, ChevronDown, ChevronUp,
} from "lucide-react";
import { listDiffs, settleDiff, getDiffDetail } from "@/lib/commands";
import { MapView } from "@/components/map-view";
import { JsonDiff } from "@/components/json-diff";
import type { DiffItem, DiffFilter, DiffDetail } from "@/lib/types";

// ── Color helpers ──

function diffTypeColor(t: string): string {
  switch (t) {
    case "Added": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Removed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "Modified": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function settlementColor(s?: string): string {
  switch (s) {
    case "Source": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "Target": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Custom": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function settlementLabel(s?: string): string {
  return s || "Unsettled";
}

/**
 * Build a compact page-number list with ellipses for large page counts.
 * E.g. (1..20, current 3) → [1, 2, 3, 4, 5, "…", 20]
 */
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// ── DiffsTab ──

const PAGE_SIZES = [50, 100, 200, 500];

export function DiffsTab({ projectId }: { projectId: number }) {
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [filter, setFilter] = useState<DiffFilter>({});
  const [selectedDiffId, setSelectedDiffId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);

  const loadDiffs = useCallback(async () => {
    try {
      const result = await listDiffs(projectId, filter, page, pageSize);
      setDiffs(result.data);
      setTotal(result.total);
    } catch (e) {
      console.error("Failed to load diffs:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, filter, page, pageSize]);

  useEffect(() => {
    loadDiffs();
  }, [loadDiffs]);

  // When filters change, reset to the first page.
  function updateFilter<K extends keyof DiffFilter>(key: K, value: DiffFilter[K]) {
    setFilter((prev) => {
      const next = { ...prev, [key]: value || undefined };
      if (key === "elementId" && !value) delete next.elementId;
      return next;
    });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-muted rounded" />
        ))}
      </div>
    );
  }

  const unsettled = diffs.filter((d) => !d.settlement).length;

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Filter Toolbar */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />

          <div className="relative w-40">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Element ID"
              className="pl-7 h-8 text-sm"
              value={filter.elementId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                updateFilter("elementId", v ? Number(v) : undefined);
              }}
              type="number"
            />
          </div>

          <Select
            value={filter.elementType ?? "all"}
            onValueChange={(v) => updateFilter("elementType", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="node">Node</SelectItem>
              <SelectItem value="way">Way</SelectItem>
              <SelectItem value="relation">Relation</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filter.diffType ?? "all"}
            onValueChange={(v) => updateFilter("diffType", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Diff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Diffs</SelectItem>
              <SelectItem value="added">Added</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
              <SelectItem value="modified">Modified</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              id="unsettled"
              checked={!!filter.onlyUnsettled}
              onCheckedChange={(v) => updateFilter("onlyUnsettled", v || undefined)}
            />
            <Label htmlFor="unsettled" className="text-sm cursor-pointer">Unsettled only</Label>
          </div>
        </div>
      </div>

      {/* Diff Table + Detail Panel */}
      <div className="flex gap-1 flex-1 min-h-0 bg-muted">
        {/* Diff List */}
        <div className={`flex flex-col flex-1 min-w-0 bg-background ${selectedDiffId ? "hidden xl:flex xl:max-w-[40%]" : ""}`}>
          {diffs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Filter className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No diffs match the current filters</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead>Element ID</TableHead>
                    <TableHead className="w-[120px]">Source Author</TableHead>
                    <TableHead className="w-[120px]">Target Author</TableHead>
                    <TableHead className="w-[100px]">Diff</TableHead>
                    <TableHead className="w-[110px]">Settlement</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diffs.map((d) => (
                    <TableRow
                      key={d.id}
                      data-state={d.id === selectedDiffId ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelectedDiffId(d.id === selectedDiffId ? null : d.id)}
                    >
                      <TableCell className="font-mono text-xs">{d.elementType}</TableCell>
                      <TableCell className="font-mono text-xs">{d.elementId}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">
                        {d.sourceAuthor ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">
                        {d.targetAuthor ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${diffTypeColor(d.diffType)}`}>
                          {d.diffType}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${settlementColor(d.settlement)}`}>
                          {settlementLabel(d.settlement)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {d.id === selectedDiffId ? "Close" : "Review →"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-2 py-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {total} diffs · {unsettled} unsettled on this page
                </span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s}/page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                {pageNumbers(page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 min-w-7 px-1.5 text-xs"
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Diff Detail Panel */}
        {selectedDiffId && (
          <DiffDetailPanel
            projectId={projectId}
            diffId={selectedDiffId}
            onClose={() => setSelectedDiffId(null)}
            onSettled={() => loadDiffs()}
          />
        )}
      </div>
    </div>
  );
}

// ── DiffDetailPanel ──

function DiffDetailPanel({
  projectId,
  diffId,
  onClose,
  onSettled,
}: {
  projectId: number;
  diffId: number;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [detail, setDetail] = useState<DiffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDiffDetail(projectId, diffId)
      .then(setDetail)
      .catch((e) => console.error("Failed to load diff detail:", e))
      .finally(() => setLoading(false));
  }, [projectId, diffId]);

  async function handleSettle(s: "Source" | "Target") {
    setSettling(true);
    try {
      await settleDiff(projectId, diffId, { settlement: s });
      onSettled();
      onClose();
    } catch (e) {
      console.error("Failed to settle:", e);
    } finally {
      setSettling(false);
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="w-[50%] min-w-[650px] max-w-[900px] border-l animate-pulse p-4 space-y-3 bg-background">
        <div className="h-6 w-1/3 bg-muted rounded" />
        <div className="h-40 bg-muted rounded" />
      </div>
    );
  }

  // ── Error ──
  if (!detail) {
    return (
      <div className="w-[50%] min-w-[650px] max-w-[900px] border-l p-4 text-center text-muted-foreground bg-background">
        Failed to load diff detail.
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-2 py-0.5 border-b shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            {detail.elementType} #{detail.elementId}
          </h3>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${diffTypeColor(detail.diffType)}`}>
            {detail.diffType}
          </span>
          {detail.settlement && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Settled: {detail.settlement}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Map Section (collapsible) ── */}
      <div className="border-b shrink-0">
        <button
          type="button"
          onClick={() => setMapExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent/50 transition-colors"
        >
          <span className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <Map className="h-3.5 w-3.5" />
            Map View
          </span>
          {mapExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {mapExpanded && (
          <div className="h-[220px] border-t">
            <MapView
              sourceElements={detail.source}
              targetElements={detail.target}
              elementType={detail.elementType}
              elementId={detail.elementId}
            />
          </div>
        )}
      </div>

      {/* ── JSON Diff Section (fills remaining space) ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 py-2 border-b shrink-0">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            Properties · Source ↔ Target
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <JsonDiff
            sourceElements={detail.source}
            targetElements={detail.target}
            elementType={detail.elementType}
            elementId={detail.elementId}
          />
        </div>
      </div>

      {/* ── Actions Footer ── */}
      <div className="border-t p-2 flex gap-2 shrink-0">
        <Button
          variant="outline"
          className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
          onClick={() => handleSettle("Source")}
          disabled={settling}
        >
          Use Source
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
          onClick={() => handleSettle("Target")}
          disabled={settling}
        >
          Use Target
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
