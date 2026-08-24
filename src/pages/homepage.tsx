import { useEffect, useState } from "react";
import { Link } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/project-card";
import { Upload, Download, Plus, FileText, FolderOpen, ArrowRight } from "lucide-react";
import { listProjects, createProject, deleteProject } from "@/lib/commands";
import { fileName, sortByUpdatedAt } from "@/lib/project-utils";
import type { Project, DiffProgress } from "@/lib/types";

const RECENT_COUNT = 6;

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sourcePath, setSourcePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // Whether the user has interacted with the form (show field-level hints only then)
  const [touched, setTouched] = useState(false);
  // projectId -> analysis percent (0-100), for Preparing projects
  const [analysisProgress, setAnalysisProgress] = useState<Record<number, number>>({});

  // Load projects on mount and listen for updates
  useEffect(() => {
    refreshProjects();

    const unlistenUpdated = listen("project-updated", () => {
      refreshProjects();
    });
    const unlistenProgress = listen<DiffProgress>("diff-progress", (event) => {
      if (typeof event.payload.percent === "number") {
        setAnalysisProgress((prev) => ({
          ...prev,
          [event.payload.projectId]: event.payload.percent as number,
        }));
      }
      if (event.payload.status === "InProgress" || event.payload.status === "Failed") {
        setAnalysisProgress((prev) => {
          const next = { ...prev };
          delete next[event.payload.projectId];
          return next;
        });
      }
    });
    return () => {
      unlistenUpdated.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
    };
  }, []);

  async function refreshProjects() {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  // Most recently updated projects, for the Recent section
  const recentProjects = sortByUpdatedAt(projects).slice(0, RECENT_COUNT);

  // ── Form validation ──
  const sourceMissing = !sourcePath;
  const targetMissing = !targetPath;
  const nameMissing = !newName.trim();
  const canCreate = !sourceMissing && !targetMissing && !nameMissing;
  const missingFields: string[] = [];
  if (sourceMissing) missingFields.push("source file");
  if (targetMissing) missingFields.push("target file");
  if (nameMissing) missingFields.push("project name");

  // ── File pickers ──
  async function pickSource() {
    const file = await open({
      filters: [{ name: "PBF Files", extensions: ["pbf"] }],
      multiple: false,
    });
    if (file) {
      setSourcePath(file as string);
      setError("");
      setTouched(true);
    }
  }

  async function pickTarget() {
    const file = await open({
      filters: [{ name: "PBF Files", extensions: ["pbf"] }],
      multiple: false,
    });
    if (file) {
      setTargetPath(file as string);
      setError("");
      setTouched(true);
    }
  }

  // ── Create project ──
  async function handleCreate() {
    setError("");
    setTouched(true);
    if (!newName.trim()) { setError("Please enter a project name."); return; }
    if (!sourcePath) { setError("Please select a source PBF file."); return; }
    if (!targetPath) { setError("Please select a target PBF file."); return; }

    setCreating(true);
    try {
      await createProject({ name: newName.trim(), sourcePath, targetPath });
      setNewName("");
      setSourcePath("");
      setTargetPath("");
      setTouched(false);
      await refreshProjects();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteProject(id);
      await refreshProjects();
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  }

  return (
    <div className="mx-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Home</h1>
        <p className="text-muted-foreground text-base">
          Create new merge projects or pick up where you left off
        </p>
      </div>

      {/* Create New Project Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Create New Project
          </CardTitle>
          <CardDescription>
            Select two PBF files and a name to start a new merge project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source */}
            <button
              type="button"
              onClick={pickSource}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer ${touched && sourceMissing ? "border-destructive/60" : "border-border"}`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="font-semibold">Source File</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {sourcePath ? fileName(sourcePath) : "Click to select PBF file"}
                </p>
              </div>
              {sourcePath && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {sourcePath}
                </span>
              )}
            </button>

            {/* Target */}
            <button
              type="button"
              onClick={pickTarget}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer ${touched && targetMissing ? "border-destructive/60" : "border-border"}`}
            >
              <Download className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="font-semibold">Target File</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {targetPath ? fileName(targetPath) : "Click to select PBF file"}
                </p>
              </div>
              {targetPath && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {targetPath}
                </span>
              )}
            </button>
          </div>

          {/* Project Name */}
          <div className="mt-4">
            <Input
              placeholder="Project name (e.g. EU-West-Merge)"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (error) setError("");
                setTouched(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {touched && nameMissing && (
              <p className="text-xs text-destructive mt-1.5">
                Project name is required.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </CardContent>
        <CardFooter className={canCreate ? "justify-end" : "justify-between"}>
          {!canCreate && (
            <p className="text-sm text-muted-foreground">
              Missing: {missingFields.join(", ")}.
            </p>
          )}
          <Button
            size="lg"
            className="min-w-[160px]"
            onClick={handleCreate}
            disabled={creating || !canCreate}
            title={canCreate ? undefined : "Fill in the missing fields to create a project"}
          >
            <Plus className="h-4 w-4" />
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </CardFooter>
      </Card>

      {/* Recent Projects */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Recent Projects</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/projects" className="gap-1.5">
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {recentProjects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No projects yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              progress={analysisProgress[p.id]}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
