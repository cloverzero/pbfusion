# PBFusion

**PBFusion** is a desktop application for comparing and merging two [OpenStreetMap](https://www.openstreetmap.org/) PBF (Protocolbuffer Binary Format) map data files. Choose a source file and a target file — the app automatically analyzes the differences, provides a per-entry review and settlement interface, and ultimately exports a merged PBF file.

> Version 0.1.0 · macOS / Windows / Linux · Built on Tauri 2

---

## Features

- **Project management**: Create, search, and delete merge projects with local persistent storage
- **Diff analysis**: Automatic ordered merge-style comparison of two PBF files, identifying Added, Removed, and Modified differences
- **Diff review**: Filter the diff list by element type, diff type, element ID, settlement status, and more
- **Per-entry settlement**: Choose to keep the Source version, Target version, or mark as Custom for each diff
- **Visual comparison**:
  - **JSON Diff** — Side-by-side diff editor powered by Monaco Editor for comparing element properties
  - **Map View** — Geographic visualization via MapLibre GL, rendering Source (blue) and Target (red) elements on an interactive map
- **Progress tracking**: Real-time settled/unsettled statistics with Tauri event-driven status updates

---

## Tech Stack

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript 5.6 (strict mode) |
| Build | Vite 6 |
| CSS | TailwindCSS 4 |
| UI Components | shadcn/ui (new-york style, Radix UI based) |
| Code Editor | Monaco Editor (@monaco-editor/react) |
| Maps | MapLibre GL |
| Routing | react-router 7 (HashRouter) |
| Desktop Bridge | @tauri-apps/api 2.x |
| Package Manager | Yarn 4 (Berry) + PnP |

### Backend (Rust / Tauri)

| Layer | Technology |
|---|---|
| Desktop Framework | Tauri 2 |
| PBF Processing | pbf-craft 1.0.1 + protobuf + flate2 |
| Serialization | serde + serde_json |
| Date/Time | chrono |
| Error Handling | anyhow + thiserror |
| File Dialogs | tauri-plugin-dialog |
| External Links | tauri-plugin-opener |

---

## Project Structure

```
pbfusion/
├── src/                          # React frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Root component: HashRouter + route config
│   ├── components/
│   │   ├── app-sidebar.tsx       # Sidebar navigation (context-aware)
│   │   ├── diff-tab.tsx          # Diff list + filters + settlement panel
│   │   ├── json-diff.tsx         # Monaco DiffEditor for JSON comparison
│   │   ├── map-view.tsx          # MapLibre GL geographic visualization
│   │   └── ui/                   # shadcn/ui component library
│   ├── lib/
│   │   ├── commands.ts           # Tauri IPC command wrappers
│   │   ├── types.ts              # Frontend type definitions (mirrors Rust models)
│   │   ├── geo-utils.ts          # OSM element geometry extraction utilities
│   │   └── utils.ts              # cn() utility function
│   └── pages/
│       ├── homepage.tsx          # Project list + new project creation
│       └── project-page.tsx      # Project detail (Overview / Differences tabs)
│
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri config (window 1400×900)
│   └── src/
│       ├── main.rs               # Rust entry point
│       ├── lib.rs                # crate root: module declarations, type conversions, app entry
│       ├── models.rs             # Data model definitions (Project, DiffItem, enums)
│       ├── storage.rs            # JSON file persistence (~/.pbfusion/)
│       └── commands/             # Tauri command implementations
│           ├── mod.rs            # module declarations
│           ├── project.rs        # list / get / delete / create_project
│           ├── diff.rs           # diff analysis, list_diffs, settle_diff, get_diff_detail
│           └── merge.rs          # merge_export (dual-cursor merge algorithm)
│
├── package.json
├── vite.config.ts
└── yarn.lock
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Yarn](https://yarnpkg.com/) 4 (locked via `packageManager` field)
- [Rust](https://www.rust-lang.org/) ≥ 1.70

### Install & Run

```bash
# Install dependencies
yarn install

# Tauri dev mode (starts Vite + Rust simultaneously)
yarn tauri dev

# Frontend only (without Tauri backend)
yarn dev

# Production build
yarn tauri build

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Usage Guide

### Creating a Project

1. On the Projects page, click the Source File and Target File areas to select two `.pbf` files
2. Enter a project name (e.g. `EU-West-Merge`)
3. Click **Create Project**

The app runs diff analysis in the background, progressing through Preparing → InProgress → Completed.

### Reviewing Diffs

1. Click a project card to go to its detail page
2. Switch to the **Differences** tab to see the diff list
3. Use the filter toolbar to narrow results by element type (Node/Way/Relation), diff type, element ID, settlement status, etc.
4. Click a diff row to expand the detail panel

### Inspecting Diff Details

The expanded detail panel offers two views:

- **Map** tab — Displays Source (blue) and Target (red) element geometries on an interactive map
- **JSON** tab — Monaco side-by-side diff editor comparing the full JSON structure of both versions

### Settling Diffs

In the detail panel toolbar, choose a resolution for each diff:

- **Use Source** — Keep the source file version
- **Use Target** — Keep the target file version
- **Custom** — Mark as needing custom handling

Settled diffs are reflected immediately in the project progress statistics.

---

## Tauri Commands

| Command | Description |
|---|---|
| `list_projects` | List all projects with optional search filtering |
| `get_project` | Fetch a single project's details |
| `create_project` | Create a new project and spawn background diff analysis |
| `delete_project` | Delete a project and its associated diff data |
| `list_diffs` | List a project's diffs with optional filtering |
| `settle_diff` | Settle a diff entry (Source/Target/Custom) |
| `get_diff_detail` | Get detailed diff data including dependency elements and map coordinates |
| `merge_export` | Merge source and target PBF into a single output file based on settlement decisions |

---

## Data Storage

All project data is stored under `~/.pbfusion/`:

```
~/.pbfusion/
├── projects.json           # Project list
└── diffs/
    └── {project_id}/
        └── diffs.json      # Diff entries for that project
```

---

## Development Conventions

- TypeScript strict mode, path alias `@/` → `./src/`
- `HashRouter` (required for Tauri's `file://` protocol compatibility)
- Styling via TailwindCSS v4 + oklch color space + CSS variable theming
- Yarn 4 PnP: dependencies resolved via `.pnp.cjs`, no `node_modules`
- Rust Edition 2021, library crate named `pbfusion_lib` (avoids Windows bin/lib name collision)

---

## Roadmap

### Done

- [x] Tauri 2 + React + Vite + TypeScript scaffolding
- [x] shadcn/ui component library + responsive sidebar
- [x] Project management (create/delete/search/persist)
- [x] Dual PBF file diff analysis (merge-sort comparison via pbf-craft IterableReader)
- [x] Diff filtering and settlement (Source / Target / Custom per diff entry)
- [x] Merged PBF export with dual-cursor algorithm (pbf-craft PbfWriter)
- [x] Diff list + filtering + settlement
- [x] Monaco Editor JSON side-by-side diff
- [x] MapLibre GL map visualization (Node/Way/Relation geometry extraction and rendering)
- [x] Tauri event-driven real-time status updates
- [x] TailwindCSS v4 light/dark theme

### To Do

- [x] **Merge export**: Generate a merged PBF file from settlement decisions
- [ ] **Settings page**: Merge options configuration (conflict resolution strategy, default output path, etc.)
- [ ] **Help page**: Usage documentation
- [ ] **Merge progress**: Progress bar and real-time feedback during export
- [ ] **Batch settlement**: Select and settle multiple diffs at once
- [ ] **App icon**: Replace the default Tauri icon
- [ ] **Test coverage**

---

## License

Private project. No license declared at this time.
