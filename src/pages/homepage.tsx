import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Upload, Download, Plus, FileText, FolderOpen, Search, Trash2 } from "lucide-react";
import { listProjects, createProject, deleteProject } from "@/lib/commands";
import type { Project, DiffProgress } from "@/lib/types";

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

function fileName(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function progressPct(total: number, settled: number): number {
  return total > 0 ? Math.round((settled / total) * 100) : 0;
}

// ── Component ──

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Load projects on mount and listen for updates
  useEffect(() => {
    refreshProjects();

    const unlisten = listen<DiffProgress>("project-updated", () => {
      refreshProjects();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function refreshProjects() {
    try {
      const list = await listProjects(search || undefined);
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  // Filter on search change with debounce
  useEffect(() => {
    const t = setTimeout(() => refreshProjects(), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── File pickers ──
  async function pickSource() {
    const file = await open({
      filters: [{ name: "PBF Files", extensions: ["pbf"] }],
      multiple: false,
    });
    if (file) setSourcePath(file as string);
  }

  async function pickTarget() {
    const file = await open({
      filters: [{ name: "PBF Files", extensions: ["pbf"] }],
      multiple: false,
    });
    if (file) setTargetPath(file as string);
  }

  // ── Create project ──
  async function handleCreate() {
    setError("");
    if (!newName.trim()) { setError("Please enter a project name."); return; }
    if (!sourcePath) { setError("Please select a source PBF file."); return; }
    if (!targetPath) { setError("Please select a target PBF file."); return; }

    setCreating(true);
    try {
      await createProject({ name: newName.trim(), sourcePath, targetPath });
      setNewName("");
      setSourcePath("");
      setTargetPath("");
      await refreshProjects();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
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
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground text-base">
          Create new merge projects or open existing ones
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
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-12 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
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
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-12 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
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
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            size="lg"
            className="min-w-[160px]"
            onClick={handleCreate}
            disabled={creating}
          >
            <Plus className="h-4 w-4" />
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </CardFooter>
      </Card>

      {/* Recent Projects */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Recent Projects</h2>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No projects yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Item
              key={p.id}
              variant="outline"
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/project/${p.id}`)}
            >
              <ItemContent>
                <div className="flex items-center gap-2 mb-1">
                  <ItemTitle>{p.name}</ItemTitle>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <ItemDescription>
                  <span className="block text-xs">
                    {fileName(p.sourcePath)} → {fileName(p.targetPath)}
                  </span>
                  {p.status === "InProgress" && (
                    <span className="block text-xs mt-1">
                      {p.settledDiffs}/{p.totalDiffs} settled ({progressPct(p.totalDiffs, p.settledDiffs)}%)
                    </span>
                  )}
                  <span className="block text-xs mt-1 opacity-60">
                    {formatDate(p.updatedAt)}
                  </span>
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDelete(p.id, e as unknown as React.MouseEvent)}
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}
