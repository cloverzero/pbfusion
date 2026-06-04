import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, FileText, MapPin, GitBranch, Target, CheckCircle, AlertCircle, Clock,
} from "lucide-react";
import { DiffsTab } from "@/components/diff-tab";
import { getProject } from "@/lib/commands";
import type { Project, ProjectUpdated } from "@/lib/types";

// ── Helpers ──

function statusLabel(s: string): string {
  switch (s) {
    case "Preparing": return "Preparing...";
    case "InProgress": return "In Progress";
    case "Completed": return "Completed";
    case "Failed": return "Failed";
    default: return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "Preparing": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "InProgress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Completed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function progressPct(total: number, settled: number): number {
  return total > 0 ? Math.round((settled / total) * 100) : 0;
}

// ── Tab definitions ──

type Tab = "overview" | "diffs";

// ── Component ──

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tab = (searchParams.get("tab") as Tab) || "overview";

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
    return () => { unlisten.then((fn) => fn()); };
  }, [loadProject, projectId]);

  function setTab(t: Tab) {
    const params = new URLSearchParams(searchParams);
    if (t === "overview") params.delete("tab");
    else params.set("tab", t);
    setSearchParams(params);
  }

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
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-8 py-6 flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Back to Projects">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(project.status)}`}>
          {statusLabel(project.status)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground ml-11 mb-6">
        Created {formatDate(project.createdAt)}
      </p>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("diffs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "diffs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Differences
        </button>
      </div>

      {tab === "overview" ? (
        <OverviewTab project={project} />
      ) : (
        <DiffsTab projectId={projectId} />
      )}
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({ project }: { project: Project }) {
  const unsettled = project.totalDiffs - project.settledDiffs;
  const pct = progressPct(project.totalDiffs, project.settledDiffs);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={GitBranch}
          label="Total Diffs"
          value={project.totalDiffs}
          color="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={CheckCircle}
          label="Settled"
          value={project.settledDiffs}
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          icon={AlertCircle}
          label="Unsettled"
          value={unsettled}
          color="text-orange-600 dark:text-orange-400"
        />
        <StatCard
          icon={Target}
          label="Progress"
          value={`${pct}%`}
          color="text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Progress Bar */}
      {project.totalDiffs > 0 && (
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* File Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Source File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono text-muted-foreground break-all">{project.sourcePath}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Target File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono text-muted-foreground break-all">{project.targetPath}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status-specific messaging */}
      {project.status === "Preparing" && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600 animate-spin" />
            <div>
              <p className="font-medium">Diff analysis in progress...</p>
              <p className="text-sm text-muted-foreground">
                Comparing source and target PBF files. This may take a moment for large files.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {project.status === "Completed" && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Merge completed successfully!</p>
              {project.outputPath && (
                <p className="text-sm text-muted-foreground font-mono">
                  Output: {project.outputPath}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Quick Nav */}
      <div className="text-center">
        <p className="text-muted-foreground text-sm mb-2">
          Review and resolve {unsettled} remaining differences
        </p>
        <Button onClick={() => {
          // navigate to diffs tab
          const url = new URL(window.location.href);
          url.searchParams.set("tab", "diffs");
          window.history.pushState({}, "", url.toString());
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}>
          <MapPin className="h-4 w-4" />
          Go to Differences
        </Button>
      </div>
    </div>
  );
}

// ── Stat Card Helper ──

function StatCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color}`} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}


