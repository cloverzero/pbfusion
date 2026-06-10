import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings, updateSettings } from "@/lib/commands";
import type { AppSettings } from "@/lib/types";
import { FolderOpen, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Track unsaved edits locally
  const [homeDir, setHomeDir] = useState("");
  const [exportDir, setExportDir] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const s = await getSettings();
      setSettings(s);
      setHomeDir(s.homeDir);
      setExportDir(s.exportDir);
    } catch (e) {
      console.error("Failed to load settings:", e);
      setFeedback({ type: "error", msg: "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  }

  async function pickDirectory(currentPath: string, setter: (v: string) => void) {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: currentPath || undefined,
    });
    if (selected) {
      setter(selected as string);
    }
  }

  async function handleSave() {
    setFeedback(null);
    setSaving(true);
    try {
      const updated = await updateSettings({
        homeDir: homeDir !== settings?.homeDir ? homeDir : undefined,
        exportDir: exportDir !== settings?.exportDir ? exportDir : undefined,
      });
      setSettings(updated);
      setHomeDir(updated.homeDir);
      setExportDir(updated.exportDir);
      setFeedback({ type: "success", msg: "Settings saved successfully" });
    } catch (e) {
      setFeedback({ type: "error", msg: String(e) });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    settings !== null &&
    (homeDir !== settings.homeDir || exportDir !== settings.exportDir);

  if (loading) {
    return (
      <div className="mx-8 py-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="mx-8 py-6 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-base">
          Configure application storage and export paths
        </p>
      </div>

      {/* Storage Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Storage
          </CardTitle>
          <CardDescription>
            Set where PBFusion stores its data and where merged files are exported by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Home Directory */}
          <div className="space-y-2">
            <Label htmlFor="home-dir">Home Directory</Label>
            <p className="text-xs text-muted-foreground">
              Stores application settings, projects, and diff data.
            </p>
            <div className="flex gap-2">
              <Input
                id="home-dir"
                value={homeDir}
                onChange={(e) => setHomeDir(e.target.value)}
                placeholder="~/.pbfusion"
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => pickDirectory(homeDir, setHomeDir)}
                title="Browse for directory"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Export Directory */}
          <div className="space-y-2">
            <Label htmlFor="export-dir">Default Export Directory</Label>
            <p className="text-xs text-muted-foreground">
              Merged PBF files are saved here by default.
            </p>
            <div className="flex gap-2">
              <Input
                id="export-dir"
                value={exportDir}
                onChange={(e) => setExportDir(e.target.value)}
                placeholder="~/.pbfusion/output"
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => pickDirectory(exportDir, setExportDir)}
                title="Browse for directory"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {feedback.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
