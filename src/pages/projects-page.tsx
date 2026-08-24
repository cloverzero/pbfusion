import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/project-card";
import { FileText, Search } from "lucide-react";
import { listProjects, deleteProject } from "@/lib/commands";
import type { Project, DiffProgress } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-base">
            All merge projects you have created
          </p>
        </div>
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
          <p>No projects yet. Head to Home to create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
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
