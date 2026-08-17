# PBFusion

> Merge two OpenStreetMap PBF files with confidence — review every difference, decide what wins, and export a clean, merged map in minutes.

**PBFusion** is a desktop app for comparing and merging two [OpenStreetMap](https://www.openstreetmap.org/) PBF (Protocolbuffer Binary Format) files. Point it at a source file and a target file, and it turns a painful, script-heavy job into a visual, click-through workflow: the app analyzes every difference, lets you review each one side by side, and exports a merged PBF file with your decisions baked in.

![screenshot](https://github.com/user-attachments/assets/3143a3c8-6f42-4928-b613-cd0d2ef98cb8)

> v0.1.0 · macOS / Windows / Linux · Built with Tauri 2

---

## Why PBFusion?

Working with OSM data at scale usually means juggling regional extracts, applying updates, or reconciling two datasets that have drifted apart. Merging them by hand means writing one-off scripts, decoding raw PBF dumps, and squinting at XML diffs — slow, error-prone, and impossible to audit.

PBFusion is built for **mappers, GIS developers, and data teams** who want a human-friendly way to do this:

- **See everything** — every added, removed, and modified element is listed, filterable, and inspectable.
- **Understand quickly** — compare elements on a map *and* in a side-by-side JSON diff, instead of parsing bytes.
- **Keep control** — you decide, element by element, which version wins.
- **Ship clean output** — the merge is only as messy as the decisions you made.

---

## What it does

| | |
|---|---|
| 🗂️ **Project management** | Create, search, and delete merge projects — your work is saved locally and ready to resume. |
| 🔍 **Automatic diff analysis** | Two PBF files in, a complete Added / Removed / Modified diff out, computed in the background. |
| 🎛️ **Powerful filtering** | Narrow thousands of diffs by element type (Node / Way / Relation), diff type, element ID, or settlement status. |
| 🗺️ **Map view** | See Source (blue) and Target (red) geometries side by side on an interactive MapLibre map. |
| 📄 **JSON diff** | A Monaco-powered side-by-side editor shows the full property structure of both versions. |
| ✅ **Per-entry settlement** | For each diff: keep the **Source** version, keep the **Target** version, or mark it **Custom**. |
| 📊 **Progress tracking** | Live settled/unsettled counts update in real time as you work through the list. |
| 📦 **Merged export** | Generate a single merged PBF file from your settlement decisions. |

---

## How it works

**1. Choose your files.** Pick a source and a target `.pbf` file and create a project. Analysis runs in the background.

**2. Review the differences.** Browse the diff list, filter it down, and inspect any element two ways — on the map and in the JSON side-by-side view.

**3. Decide and export.** Settle each diff (Source / Target / Custom), watch your progress tick up, then export the merged PBF file.

---

## Getting started

### Run from source

**Prerequisites:** [Node.js](https://nodejs.org/) ≥ 18 · [Yarn](https://yarnpkg.com/) 4 · [Rust](https://www.rust-lang.org/) ≥ 1.70

```bash
# Install dependencies
yarn install

# Development mode (Vite + Rust together)
yarn tauri dev

# Frontend only (no Tauri backend)
yarn dev

# Production build
yarn tauri build
```

### Using PBFusion

1. On the **Projects** page, click the *Source File* and *Target File* areas to select two `.pbf` files, give the project a name, and hit **Create Project**.
2. Open the project and switch to the **Differences** tab to see the diff list.
3. Click any diff to open the detail panel — use the **Map** and **JSON** views to inspect it.
4. Choose **Use Source**, **Use Target**, or **Custom** to settle it, then export the merged file when you're done.

---

## Built with

Tauri 2 · Rust · React · TypeScript · pbf-craft (PBF processing) · Monaco Editor (JSON diff) · MapLibre GL (maps) · TailwindCSS + shadcn/ui

---

## What's next

**Shipped**
- [x] Project management (create / search / delete / persist)
- [x] Dual-PBF diff analysis with progress tracking
- [x] Diff filtering & settlement (Source / Target / Custom)
- [x] Side-by-side JSON diff editor
- [x] Interactive map visualization for Node / Way / Relation
- [x] Merged PBF export
- [x] Settings page
- [x] Light / dark themes

**On the roadmap**
- [ ] Help page with usage documentation
- [ ] Batch settlement — settle multiple diffs at once
- [ ] App icon
- [ ] Test coverage

---

## License

Private project. No license declared at this time.
