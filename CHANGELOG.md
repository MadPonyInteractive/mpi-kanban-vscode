## [0.1.8] (2026-05-31)

### Features

* Add the JSON task board experience for `.agents/mpi-kanban/board.json` and
  linked `.agents/mpi-kanban/tasks/<id>/` task workspaces.
* Refine task panels and tint cards by maturity state for quicker board
  scanning.
* Update the Marketplace README and board screenshot to clarify that the VS
  Code extension supports the Mpi-Kanban Agent Skills pack rather than acting as
  a standalone Kanban plugin.

## [0.1.7] (2026-05-27)

### Features

* Add backward-compatible support and documentation for the upcoming `VALIDATING`
  workflow column.
* Show the MPI logo for the editor-title shortcut that opens the board.
* Add parser regression coverage for five-column board round-tripping.

## [0.1.6] (2026-05-24)

### Fixes

* Refresh the existing webview after board edits instead of rebuilding it, so dragged tasks move visually without requiring a manual Markdown save.
* Replace the tag-triggered Marketplace publish workflow with a GitHub Release workflow that attaches a built VSIX without Azure DevOps or Marketplace PAT setup.

## [0.1.5] (2026-05-24)

### Fixes

* Watch `.agents/mpi-kanban/kanban.md` to match the MPI agent skill pack's project layout.

## [0.1.4] (2026-05-13)

### Fixes

* Reload the board from disk when agents update `.agents/mpi-kanban/kanban.md` outside VS Code.
* Add a lightweight modified-time polling fallback for missed filesystem watcher events.
* Remove the column archive button and extension-side archive UI.

## [0.1.3] (2026-05-13)

### Fixes

* Reload the MPI board when VS Code restores an existing Mpi-Kanban webview after restart.
* Resend board data after the webview script signals readiness.
* Remove the custom add-column button from the MPI fixed-column board UI.

## [0.1.2] (2026-05-13)

### Documentation

* Update Marketplace README wording now that the Mpi-Kanban agent plugin is published.
* Document manual Marketplace update flow as the default release process.

## [0.1.1] (2026-05-13)

### Fixes

* Load webview HTML from packaged `dist` assets so the Marketplace build renders the board.

## [0.1.0] (2026-05-13)

### Fork

* Rename the extension to Mpi-Kanban for the MPI agent workflow.
* Target `.agents/mpi-kanban/kanban.md` in the current workspace instead of switching between arbitrary Markdown files.
* Add explicit fork attribution in `NOTICE`.

## [1.0.2] (2025-06-04)

### Features

* **fix:** Support CRLF line endings


## [1.1.0] (2025-06-16)


### Features

* **feature:** Add enable/disable file listener command for edit multiple files @ssebs ([#4](https://github.com/holooooo/markdown-kanban/pull/4))

## [1.1.1] (2025-06-23)

### Features

* **feature:** Allow to show/hide filter section
* **feature:** Auto save edited files

## [1.2.0] (2025-07-01)

### Features

* **feature:** Add workload support (Easy, Normal, Hard, Extreme) @ssebs ([#13](https://github.com/holooooo/markdown-kanban/issues/10))
* **feature:** Add steps support
* **feature:** Add tag autocomplete with prefix matching for existing tags @ssebs ([#9](https://github.com/holooooo/markdown-kanban/issues/9))

### refactor

* **refactor:** Separate html code @ssebs ([#12](https://github.com/holooooo/markdown-kanban/pull/12))


## [1.2.1] (2025-07-02)

### Fixes

* **fix:** Fix the webview.html not included in the extension package

## [1.2.2] (2025-07-03)

### Features

* **feature:** Add defaultExpanded support for task @ssebs ([#13](https://github.com/holooooo/markdown-kanban/issues/13))
* **feature:** Add support for header format
* **feature:** Optimize task and step dragging experience for task @ssebs ([#14](https://github.com/holooooo/markdown-kanban/issues/14))


## [1.2.3] (2025-07-05)

### Features

* **feature:** Add setting for task header format


## [1.3.0] (2025-07-05)

* **feature:** Add column archive support


## [1.3.1] (2025-07-06)

### Chore

* **chore:** shorten command name to "Kanban"

