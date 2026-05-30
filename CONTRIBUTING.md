# Contributing to Mpi-Kanban

## Preview the board UI (local smoke test)

Use this before shipping any UI change to `src/html/*` or
`src/kanbanWebviewPanel.ts`. It opens the **real** extension in a throwaway
VS Code window pointed at a sample board, so you can eyeball the rendered UI.

1. Install dependencies once:

   ```bash
   npm install
   ```

2. Open this repository folder in VS Code.

3. Open the Command Palette (**`Ctrl+Shift+P`**), run **"Debug: Select and
   Start Debugging"**, and pick **"Run Extension (sample board)"**.

   This compiles the extension, launches an Extension Development Host window
   with the `test/fixtures/sample-board` workspace already open, and opens
   `.agents/mpi-kanban/board.json`.

4. To see the **rendered board**, run the Command Palette (`Ctrl+Shift+P`) and
   choose **"Open Mpi-Kanban Board"**.

5. Look at the board. The sample exercises every render path:

   - all three columns (`To do`, `Doing`, `Done`),
   - visible `MPI-*` task IDs,
   - attention and status badges,
   - checklist preview for active work,
   - task workspace links in the detail panel.

6. Exercise the UI by hand: drag cards between columns, add / edit / delete a
   card, and open task workspace links. The extension writes `board.json`,
   `tasks/<id>/task.json`, and event JSONL files on disk.

### Resetting the fixture

Hand-testing mutates `test/fixtures/sample-board/.agents/mpi-kanban/board.json`
and task workspace files.
Restore the curated sample with:

```bash
git checkout -- test/fixtures/sample-board/.agents/mpi-kanban
```

### "Run Extension" vs "Run Extension (sample board)"

- **Run Extension** â€” opens an empty dev host (no folder). Use it to test
  activation against your own workspace.
- **Run Extension (sample board)** â€” opens the curated fixture and board. Use
  it for UI preview / smoke testing.

Both are launched the same way: Command Palette (`Ctrl+Shift+P`) â†’ **"Debug:
Select and Start Debugging"** â†’ pick the config.

## Run the unit tests

Parser regression tests run in a real VS Code instance via
`@vscode/test-electron`:

```bash
npm test
```

The suite also covers legacy Markdown migration into a temporary workspace. It
checks that the migration creates `board.json`, task files, event logs, and a
legacy snapshot while leaving the source `kanban.md` unchanged.

> **First run downloads VS Code.** `@vscode/test-electron` fetches a VS Code
> build the first time, so the first `npm test` needs network access and takes
> longer. Subsequent runs are offline and fast.

You can also run them under the debugger via Command Palette
(`Ctrl+Shift+P`) â†’ **"Debug: Select and Start Debugging"** â†’ **"Extension
Tests"**.
