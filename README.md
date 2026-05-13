# Mpi-Kanban

Mpi-Kanban is a VS Code extension for viewing and editing the Kanban board used
by the MPI agent workflow plugin.

The extension targets this board in the current workspace:

```text
.claude/mpi-kanban/kanban.md
```

The board file does not need to be open in an editor. Use **Mpi-Kanban: Open
Mpi-Kanban Board** from the Command Palette, or the editor title action when
viewing the workspace `kanban.md`. When the MPI plugin saves the board file,
the open Kanban view reloads from disk.

## Compatibility

The expected board columns are:

```markdown
## BACKLOG
## PLANNING
## IMPLEMENTING
## COMPLETED
```

The supported task metadata fields match the MPI plugin schema:

- `due`
- `tags`
- `priority`
- `workload`
- `defaultExpanded`
- `steps`

## Development

```bash
npm install
npm run compile
```

## Attribution

This extension is a fork of
[Markdown Kanban](https://github.com/holooooo/markdown-kanban) by holooooo.
The upstream project is licensed under MIT. The original copyright notice is
preserved in [LICENSE](./LICENSE), and fork-specific attribution is recorded in
[NOTICE](./NOTICE).

## License

MIT.
