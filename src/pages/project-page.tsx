import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Target,
  Clock,
  Merge,
  Loader2,
} from "lucide-react";
import { DiffsTab } from "@/components/diff-tab";
import { getProject, mergeExport } from "@/lib/commands";
import type { Project, ProjectUpdated, DiffProgress, MergeProgress } from "@/lib/types";

// ── Helpers ──

function statusLabel(s: string): string {
  switch (s) {
    case "Preparing":
      return "Preparing...";
    case "InProgress":
      return "In Progress";
    case "Completed":
      return "Completed";
    case "Failed":
      return "Failed";
    default:
      return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "Preparing":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "InProgress":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function progressPct(total: number, settled: number): number {
  return total > 0 ? Math.round((settled / total) * 100) : 0;
}

function fileName(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}

// ── Component ──

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [merging, setMerging] = useState(false);
  const [analysisPercent, setAnalysisPercent] = useState<number | null>(null);
  const [mergeProgress, setMergeProgress] = useState<MergeProgress | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const p = await getProject(projectId);
      setProject(p);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    const unlisten = listen<ProjectUpdated>("project-updated", (event) => {
      if (event.payload.projectId === projectId) {
        loadProject();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadProject, projectId]);

  // Listen for diff-analysis progress (Preparing stage).
  useEffect(() => {
    const unlisten = listen<DiffProgress>("diff-progress", (event) => {
      if (event.payload.projectId !== projectId) return;
      if (typeof event.payload.percent === "number") {
        setAnalysisPercent(event.payload.percent);
      }
      if (event.payload.status === "InProgress" || event.payload.status === "Failed") {
        setAnalysisPercent(null);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectId]);

  // Listen for background merge progress.
  useEffect(() => {
    const unlisten = listen<MergeProgress>("merge-progress", (event) => {
      if (event.payload.projectId !== projectId) return;
      if (event.payload.status === "Completed" || event.payload.status === "Failed") {
        setMerging(false);
        setMergeProgress(null);
        if (event.payload.status === "Failed") {
          setError(event.payload.message || "Merge failed");
        } else {
          setError("");
        }
        loadProject();
      } else {
        setMergeProgress(event.payload);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectId, loadProject]);

  const handleMerge = async () => {
    setError("");
    setMergeProgress(null);
    setMerging(true);
    try {
      await mergeExport(projectId);
    } catch (e) {
      setMerging(false);
      setError(String(e));
    }
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="mx-8 py-6 flex flex-col flex-1 min-h-0">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 bg-muted rounded" />
          <div className="h-4 w-1/4 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error || !project) {
    return (
      <div className="mx-8 py-6 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive opacity-50" />
        <p className="text-destructive">{error || "Project not found"}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  const unsettled = project.totalDiffs - project.settledDiffs;
  const pct = progressPct(project.totalDiffs, project.settledDiffs);

  return (
    <div className="mx-8 py-6 flex flex-col flex-1 min-h-0">
      {/* ── Header + Stats Row ── */}
      <div className="flex items-start justify-between mb-3">
        {/* Left: title + badge + date */}
        <div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              title="Back to Projects"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              {project.name}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(project.status)}`}
            >
              {statusLabel(project.status)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground ml-11 mt-0.5">
            Created {formatDate(project.createdAt)}
          </p>
        </div>

        {/* Right: compact stats + merge action */}
        <div className="flex items-center gap-6 pr-2">
          <MiniStat
            icon={GitBranch}
            label="Total"
            value={project.totalDiffs}
            color="text-blue-600 dark:text-blue-400"
          />
          <MiniStat
            icon={CheckCircle}
            label="Settled"
            value={project.settledDiffs}
            color="text-green-600 dark:text-green-400"
          />
          <MiniStat
            icon={AlertCircle}
            label="Unsettled"
            value={unsettled}
            color="text-orange-600 dark:text-orange-400"
          />
          <MiniStat
            icon={Target}
            label="Progress"
            value={`${pct}%`}
            color="text-purple-600 dark:text-purple-400"
          />
          {merging ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm font-medium tabular-nums">
                {mergeProgress
                  ? `${Math.round(mergeProgress.percent)}%`
                  : "Starting…"}
              </span>
            </div>
          ) : (
            <Button
              size="sm"
              disabled={unsettled > 0}
              onClick={handleMerge}
              className="gap-1.5"
            >
              <Merge className="h-4 w-4" />
              Merge
            </Button>
          )}
        </div>
      </div>

      {/* ── Progress + File Info Row ── */}
      <div className="mb-4 space-y-2">
        {/* Progress bar */}
        {project.totalDiffs > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
              {pct}%
            </span>
          </div>
        )}

        {/* File paths */}
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span className="truncate max-w-[45%]" title={project.sourcePath}>
            <span className="font-medium text-foreground/70">Source:</span>{" "}
            {fileName(project.sourcePath)}
          </span>
          <span className="truncate max-w-[45%]" title={project.targetPath}>
            <span className="font-medium text-foreground/70">Target:</span>{" "}
            {fileName(project.targetPath)}
          </span>
        </div>

        {/* Merge progress (background task) */}
        {merging && mergeProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, mergeProgress.percent)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {Math.round(mergeProgress.percent)}%
              </span>
            </div>
            {typeof mergeProgress.processedDiffs === "number" &&
              typeof mergeProgress.totalDiffs === "number" && (
                <p className="text-xs text-muted-foreground">
                  Merging… {mergeProgress.processedDiffs}/{mergeProgress.totalDiffs} diffs
                  processed
                </p>
              )}
          </div>
        )}

        {/* Status-specific message */}
        {project.status === "Preparing" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
              <Clock className="h-4 w-4 animate-spin" />
              {analysisPercent !== null
                ? `Diff analysis in progress — ${Math.round(analysisPercent)}%`
                : "Diff analysis in progress — comparing source and target PBF files..."}
            </div>
            {analysisPercent !== null && (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-yellow-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${analysisPercent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                  {Math.round(analysisPercent)}%
                </span>
              </div>
            )}
          </div>
        )}
        {project.status === "Completed" && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Merge completed successfully
            {project.outputPath && (
              <span className="font-mono text-xs opacity-75 ml-1">
                → {fileName(project.outputPath)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Differences ── */}
      <DiffsTab projectId={projectId} />
    </div>
  );
}

// ── Mini Stat ──

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {label}
        </p>
      </div>
    </div>
  );
}
