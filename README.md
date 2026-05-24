# Mpi-Kanban

VS Code Kanban board for the MadPonyInteractive agent workflow.

Mpi-Kanban renders the workflow board used by the
[Mpi-Kanban agent plugin](https://github.com/MadPonyInteractive/mpi-kanban) as
an interactive board inside VS Code. The agent plugin owns the workflow state:
it creates plans, moves work through the board, writes handoffs, and keeps the
Markdown file current. This extension owns the editor experience for that board.

![Mpi-Kanban board](./imgs/board.png)

## Features

- **MPI board contract**: opens `.agents/mpi-kanban/kanban.md` in the current
  workspace.
- **Kanban view**: displays MPI workflow tasks in fixed workflow columns.
- **Live reload**: watches the board file and reloads when the agent workflow
  updates Markdown on disk.
- **Drag and drop**: moves tasks between columns and reorders tasks inside a
  column.
- **Task details**: supports descriptions, due dates, tags, priority, workload,
  default-expanded cards, and checklist steps.
- **Filtering and sorting**: filters visible tasks by tag/workload text and
  visually sorts tasks by name, due date, priority, workload, or tags.
- **VS Code themed UI**: follows the active editor theme and can be kept open
  beside Claude Code, Codex, or another agent panel.

## Quick Start

### Install

Install from the VS Code Marketplace:

```text
MadPonyInteractive.mpi-kanban
```

### Open The Board

1. Open a workspace that contains `.agents/mpi-kanban/kanban.md`.
2. Run **Mpi-Kanban: Open Mpi-Kanban Board** from the Command Palette.
3. Leave the board open while the agent workflow edits the Markdown file.

The board file is normally created by the Mpi-Kanban agent plugin when you start
or continue MPI workflow work. If you are testing the extension without the
plugin, create `.agents/mpi-kanban/kanban.md` manually.

## Board Contract

The extension is intentionally focused on the MPI workflow board. The board must
use these columns:

```markdown
## BACKLOG
## PLANNING
## IMPLEMENTING
## COMPLETED
```

Supported task metadata fields:

- `due`
- `tags`
- `priority`
- `workload`
- `defaultExpanded`
- `steps`

The workflow plugin may also add a plan reference inside task bodies:

```text
Plan file: docs/plans/YYYY-MM-DD-example.md
```

Do not add custom columns or metadata fields unless the workflow plugin and this
extension are updated together.

## Example Board

```markdown
# Mpi-Kanban

## BACKLOG

### Publish VS Code extension
- tags: [release, vscode]
- priority: high
- workload: Normal
- steps:
      - [x] Package VSIX
      - [ ] Publish Marketplace update

## PLANNING

## IMPLEMENTING

## COMPLETED
```

## Filtering And Sorting

The filter box matches task `tags` and `workload` values. Multiple filter terms
can be entered with commas, such as:

```text
release,vscode
```

Sorting is visual only inside the webview. It changes how tasks are displayed in
each column, but it does not rewrite the Markdown order until a task is edited
or moved.

## Development

```bash
npm install
npm run compile
```

Create a local VSIX package:

```bash
npm exec -- vsce package
```

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for Marketplace account setup, manual
Marketplace updates, and the GitHub Release process.

## Attribution

This extension is a fork of
[Markdown Kanban](https://github.com/holooooo/markdown-kanban) by holooooo.
The upstream project is licensed under MIT. The original copyright notice is
preserved in [LICENSE](./LICENSE), and fork-specific attribution is recorded in
[NOTICE](./NOTICE).

## License

MIT.

