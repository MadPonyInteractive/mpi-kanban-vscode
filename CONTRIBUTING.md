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
   `.agents/mpi-kanban/kanban.md`.

4. The file opens as Markdown text. To see the **rendered board**, run the
   Command Palette (`Ctrl+Shift+P`) → **"Open Mpi-Kanban Board"**, or click the
   MPI logo in the `kanban.md` editor title bar.

5. Look at the board. The sample exercises every render path:

   - all five columns (`BACKLOG` → `COMPLETED`),
   - low / medium / high priority badges,
   - Easy / Normal / Hard / Extreme workload pills,
   - upcoming and overdue due-date badges,
   - single and multiple tag chips,
   - collapsed and `defaultExpanded: true` cards,
   - step progress bars at 0/1, 2/4, and 2/2.

6. Exercise the UI by hand: drag cards between columns, add / edit / delete a
   card, toggle steps. The extension writes changes back to the fixture's
   `kanban.md` on disk, so you can confirm persistence too.

### Resetting the fixture

Hand-testing mutates `test/fixtures/sample-board/.agents/mpi-kanban/kanban.md`.
Restore the curated sample with:

```bash
git checkout -- test/fixtures/sample-board/.agents/mpi-kanban/kanban.md
```

### "Run Extension" vs "Run Extension (sample board)"

- **Run Extension** — opens an empty dev host (no folder). Use it to test
  activation against your own workspace.
- **Run Extension (sample board)** — opens the curated fixture and board. Use
  it for UI preview / smoke testing.

Both are launched the same way: Command Palette (`Ctrl+Shift+P`) → **"Debug:
Select and Start Debugging"** → pick the config.

## Run the unit tests

Parser regression tests run in a real VS Code instance via
`@vscode/test-electron`:

```bash
npm test
```

> **First run downloads VS Code.** `@vscode/test-electron` fetches a VS Code
> build the first time, so the first `npm test` needs network access and takes
> longer. Subsequent runs are offline and fast.

You can also run them under the debugger via Command Palette
(`Ctrl+Shift+P`) → **"Debug: Select and Start Debugging"** → **"Extension
Tests"**.
