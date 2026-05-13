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
* Target `.claude/mpi-kanban/kanban.md` in the current workspace instead of switching between arbitrary Markdown files.
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
