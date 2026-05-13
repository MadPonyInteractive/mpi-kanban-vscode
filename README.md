# Mpi-Kanban

Mpi-Kanban is the VS Code companion extension for the MadPonyInteractive
Kanban workflow.

It renders the workflow board used by the
[Mpi-Kanban agent plugin](https://github.com/MadPonyInteractive/mpi-kanban) as
an interactive Kanban view inside VS Code. The plugin owns the workflow: it
creates plans, moves work through the board, writes handoffs, and keeps the
Markdown state current. This extension owns the editor experience for that
board.

The agent plugin repository is the public home for the workflow that creates and
maintains the board this extension displays.

## What It Opens

The extension watches one board file in the current workspace:

```text
.claude/mpi-kanban/kanban.md
```

When that file exists, run **Mpi-Kanban: Open Mpi-Kanban Board** from the
Command Palette. The board can stay open while the workflow plugin edits the
Markdown file; changes are reloaded from disk.

Without the workflow plugin, the extension can still display a compatible
Markdown board, but it is designed for the Mpi-Kanban board contract rather than
general-purpose Markdown kanban files.

## Board Contract

The board must use these columns:

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

## Install

Install from the VS Code Marketplace:

```text
MadPonyInteractive.mpi-kanban
```

The board file is created by the workflow plugin when you start or continue MPI
work. If you are testing the extension without the plugin, create
`.claude/mpi-kanban/kanban.md` manually using the columns above.

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

See [PUBLISHING.md](./PUBLISHING.md) for Marketplace account setup, GitHub
Actions secrets, and the release process.

## Attribution

This extension is a fork of
[Markdown Kanban](https://github.com/holooooo/markdown-kanban) by holooooo.
The upstream project is licensed under MIT. The original copyright notice is
preserved in [LICENSE](./LICENSE), and fork-specific attribution is recorded in
[NOTICE](./NOTICE).

## License

MIT.
