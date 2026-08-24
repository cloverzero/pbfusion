import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Trash2 } from "lucide-react";
import { statusColor, statusLabel, fileName, formatDate, progressPct } from "@/lib/project-utils";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  /** Analysis percent (0-100) shown for Preparing projects. */
  progress?: number;
  onDelete: (id: number) => void;
}

export function ProjectCard({ project, progress, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <Item
      variant="outline"
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <ItemContent>
        <div className="flex items-center gap-2 mb-1">
          <ItemTitle>{project.name}</ItemTitle>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor(project.status)}`}>
            {statusLabel(project.status)}
          </span>
        </div>
        <ItemDescription>
          <span className="block text-xs">
            {fileName(project.sourcePath)} → {fileName(project.targetPath)}
          </span>
          {project.status === "Preparing" && (
            <span className="block text-xs mt-1">
              {progress !== undefined
                ? `Analyzing… ${Math.round(progress)}%`
                : "Analyzing…"}
            </span>
          )}
          {project.status === "InProgress" && (
            <span className="block text-xs mt-1">
              {project.settledDiffs}/{project.totalDiffs} settled ({progressPct(project.totalDiffs, project.settledDiffs)}%)
            </span>
          )}
          <span className="block text-xs mt-1 opacity-60">
            {formatDate(project.updatedAt)}
          </span>
          {project.status === "Preparing" && progress !== undefined && (
            <span className="block mt-1.5">
              <span className="block h-1.5 bg-muted rounded-full overflow-hidden">
                <span
                  className="block h-full bg-yellow-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </span>
            </span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id);
          }}
          title="Delete project"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </ItemActions>
    </Item>
  );
}
