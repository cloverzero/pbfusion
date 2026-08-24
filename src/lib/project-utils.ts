// ── Shared project display helpers ──

export function statusLabel(s: string): string {
  switch (s) {
    case "Preparing": return "Preparing...";
    case "InProgress": return "In Progress";
    case "Completed": return "Completed";
    case "Failed": return "Failed";
    default: return s;
  }
}

export function statusColor(s: string): string {
  switch (s) {
    case "Preparing": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "InProgress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Completed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export function fileName(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function progressPct(total: number, settled: number): number {
  return total > 0 ? Math.round((settled / total) * 100) : 0;
}

/** Sorts projects by most recently updated first. */
export function sortByUpdatedAt<T extends { updatedAt: string }>(projects: T[]): T[] {
  return [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
