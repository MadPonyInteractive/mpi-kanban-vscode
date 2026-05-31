import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import { MarkdownKanbanParser } from '../markdownParser';
import { extractPlanFilePath, mapLegacyColumn, TaskBoardStore } from '../taskBoardStore';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Parses and preserves the MPI validation column', () => {
		const board = MarkdownKanbanParser.parseMarkdown(`# Mpi-Kanban

## BACKLOG

### Backlog item

## PLANNING

## IMPLEMENTING

### Implementation item

## VALIDATING

### Validation item
  - tags: [release, vscode]
  - priority: high
  - defaultExpanded: true
    \`\`\`md
    Verify the five-column board.
    \`\`\`

## COMPLETED
`);

		assert.deepStrictEqual(
			board.columns.map(column => column.title),
			['BACKLOG', 'PLANNING', 'IMPLEMENTING', 'VALIDATING', 'COMPLETED']
		);
		assert.strictEqual(board.columns[3].tasks[0].title, 'Validation item');
		assert.strictEqual(board.columns[3].tasks[0].priority, 'high');

		const markdown = MarkdownKanbanParser.generateMarkdown(board);
		assert.match(markdown, /## VALIDATING/);
		assert.match(markdown, /### Validation item/);
	});

	test('Continues to parse legacy four-column boards', () => {
		const board = MarkdownKanbanParser.parseMarkdown('# Mpi-Kanban\n\n## BACKLOG\n\n## PLANNING\n\n## IMPLEMENTING\n\n## COMPLETED\n');

		assert.deepStrictEqual(board.columns.map(column => column.title), ['BACKLOG', 'PLANNING', 'IMPLEMENTING', 'COMPLETED']);
	});

	test('Maps legacy MPI columns into JSON board columns', () => {
		assert.deepStrictEqual(mapLegacyColumn('BACKLOG'), { column: 'todo', maturity: 'idea', status: 'active' });
		assert.deepStrictEqual(mapLegacyColumn('PLANNING'), { column: 'todo', maturity: 'planned', status: 'active' });
		assert.deepStrictEqual(mapLegacyColumn('IMPLEMENTING'), { column: 'doing', maturity: 'in-progress', status: 'active' });
		assert.deepStrictEqual(mapLegacyColumn('VALIDATING'), { column: 'doing', maturity: 'validating', status: 'active' });
		assert.deepStrictEqual(mapLegacyColumn('COMPLETED'), { column: 'done', maturity: 'complete', status: 'accepted' });
	});

	test('Extracts legacy plan file links from card descriptions', () => {
		assert.strictEqual(
			extractPlanFilePath('Some detail\nPlan file: docs/plans/example.md\nMore detail'),
			'docs/plans/example.md'
		);
		assert.strictEqual(extractPlanFilePath('No plan here'), undefined);
	});

	test('Loads JSON board metadata for a selected non-first workspace folder', async () => {
		const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-kanban-empty-'));
		const activeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-kanban-active-'));
		const boardDir = path.join(activeDir, '.agents', 'mpi-kanban');
		const activeName = `active-root-${Date.now()}`;

		try {
			await fs.mkdir(boardDir, { recursive: true });
			await fs.writeFile(path.join(boardDir, 'board.json'), JSON.stringify({
				schema: 'mpi-kanban/board/v1',
				next_id: 1,
				columns: { todo: [], doing: [], done: [] },
			}, null, 2), 'utf8');

			const emptyFolder: vscode.WorkspaceFolder = {
				uri: vscode.Uri.file(emptyDir),
				name: 'empty-root',
				index: 0,
			};
			const activeFolder: vscode.WorkspaceFolder = {
				uri: vscode.Uri.file(activeDir),
				name: activeName,
				index: 1,
			};

			assert.strictEqual(await new TaskBoardStore(emptyFolder).exists(), false);
			assert.strictEqual(await new TaskBoardStore(activeFolder).exists(), true);
			assert.strictEqual(TaskBoardStore.matchesWorkspaceFolder(activeFolder, activeFolder.uri.toString()), true);
			assert.strictEqual(TaskBoardStore.matchesWorkspaceFolder(activeFolder, activeFolder.uri.fsPath), true);
			assert.strictEqual(TaskBoardStore.matchesWorkspaceFolder(activeFolder, activeName), true);

			const store = new TaskBoardStore(activeFolder);
			const board = await store.loadWebviewBoard();

			assert.strictEqual(board.workspaceName, activeName);
			assert.deepStrictEqual(board.columns.map(column => column.id), ['todo', 'doing', 'done']);
			assert.deepStrictEqual(board.columns.map(column => column.tasks), [[], [], []]);
			assert.deepStrictEqual(board.workspaceMember, {
				name: activeName,
				index: 1,
				uri: activeFolder.uri.toString(),
				fsPath: activeFolder.uri.fsPath,
				boardPath: '.agents/mpi-kanban/board.json',
				isSelected: true,
			});
		} finally {
			await fs.rm(emptyDir, { recursive: true, force: true });
			await fs.rm(activeDir, { recursive: true, force: true });
		}
	});

	test('Migrates a legacy Markdown board into JSON task files', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-kanban-'));
		const legacyDir = path.join(tempDir, '.agents', 'mpi-kanban');
		const legacyMarkdown = `# Mpi-Kanban

## BACKLOG

### Backlog idea
  - tags: [Idea]
    \`\`\`md
    Capture this later.
    \`\`\`

## PLANNING

## IMPLEMENTING

### Active work
  - priority: high
  - steps:
      - [x] First step
      - [ ] Second step
    \`\`\`md
    Plan file: docs/plans/active-work.md
    \`\`\`

## VALIDATING

## COMPLETED
`;

		try {
			await fs.mkdir(legacyDir, { recursive: true });
			await fs.writeFile(path.join(legacyDir, 'kanban.md'), legacyMarkdown, 'utf8');

			const folder: vscode.WorkspaceFolder = {
				uri: vscode.Uri.file(tempDir),
				name: 'legacy-board',
				index: 0,
			};
			const store = new TaskBoardStore(folder);
			const board = await store.migrateLegacyBoard();

			assert.deepStrictEqual(board.columns.map(column => column.tasks.map(task => task.id)), [['MPI-1'], ['MPI-2'], []]);

			const boardJson = JSON.parse(await fs.readFile(path.join(legacyDir, 'board.json'), 'utf8')) as { next_id: number; columns: Record<string, string[]> };
			assert.strictEqual(boardJson.next_id, 3);
			assert.deepStrictEqual(boardJson.columns.todo, ['MPI-1']);
			assert.deepStrictEqual(boardJson.columns.doing, ['MPI-2']);

			const legacyAfterMigration = await fs.readFile(path.join(legacyDir, 'kanban.md'), 'utf8');
			assert.strictEqual(legacyAfterMigration, legacyMarkdown);

			const snapshots = await fs.readdir(path.join(legacyDir, 'legacy'));
			assert.strictEqual(snapshots.length, 1);

			const plan = await fs.readFile(path.join(legacyDir, 'tasks', 'MPI-2', 'plan.md'), 'utf8');
			assert.match(plan, /Legacy plan file: docs\/plans\/active-work\.md/);

			const checklist = await fs.readFile(path.join(legacyDir, 'tasks', 'MPI-2', 'checklist.md'), 'utf8');
			assert.match(checklist, /- \[x\] First step/);
			assert.match(checklist, /- \[ \] Second step/);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('Toggles JSON checklist items without moving the task', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-kanban-'));
		const boardDir = path.join(tempDir, '.agents', 'mpi-kanban');
		const taskDir = path.join(boardDir, 'tasks', 'MPI-1');

		try {
			await fs.mkdir(taskDir, { recursive: true });
			await fs.writeFile(path.join(boardDir, 'board.json'), JSON.stringify({
				schema: 'mpi-kanban/board/v1',
				next_id: 2,
				columns: { todo: [], doing: ['MPI-1'], done: [] },
			}, null, 2), 'utf8');
			await fs.writeFile(path.join(boardDir, 'events.jsonl'), '', 'utf8');
			await fs.writeFile(path.join(taskDir, 'events.jsonl'), '', 'utf8');
			await fs.writeFile(path.join(taskDir, 'task.json'), JSON.stringify({
				schema: 'mpi-kanban/task-card/v1',
				id: 'MPI-1',
				title: 'Checklist task',
				column: 'doing',
				maturity: 'planned',
				status: 'active',
				created_at: '2026-05-31T00:00:00.000Z',
				updated_at: '2026-05-31T00:00:00.000Z',
				links: {
					brief: 'brief.md',
					plan: 'plan.md',
					checklist: 'checklist.md',
					validation: 'validation.md',
					files: 'files.json',
					events: 'events.jsonl',
					handoffs: 'handoffs/',
					research: 'research/',
				},
			}, null, 2), 'utf8');
			await fs.writeFile(path.join(taskDir, 'checklist.md'), '# Checklist\n\n- [ ] User confirms setup\n- [x] Agent verifies output\n', 'utf8');

			const folder: vscode.WorkspaceFolder = {
				uri: vscode.Uri.file(tempDir),
				name: 'json-board',
				index: 0,
			};
			const store = new TaskBoardStore(folder);
			const board = await store.toggleChecklistItem('MPI-1', 0, true, { text: 'User confirms setup', completed: false });

			assert.deepStrictEqual(board.columns.map(column => column.tasks.map(task => task.id)), [[], ['MPI-1'], []]);

			const checklist = await fs.readFile(path.join(taskDir, 'checklist.md'), 'utf8');
			assert.match(checklist, /- \[x\] User confirms setup/);
			assert.match(checklist, /- \[x\] Agent verifies output/);

			const events = await fs.readFile(path.join(taskDir, 'events.jsonl'), 'utf8');
			assert.match(events, /"type":"checklist\.item_checked"/);
			assert.match(events, /"actor":"user"/);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('Normalizes maturity when moving JSON tasks between columns', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-kanban-move-'));
		const boardDir = path.join(tempDir, '.agents', 'mpi-kanban');
		const taskDir = path.join(boardDir, 'tasks', 'MPI-1');

		try {
			await fs.mkdir(taskDir, { recursive: true });
			await fs.writeFile(path.join(boardDir, 'board.json'), JSON.stringify({
				schema: 'mpi-kanban/board/v1',
				next_id: 2,
				columns: { todo: ['MPI-1'], doing: [], done: [] },
			}, null, 2), 'utf8');
			await fs.writeFile(path.join(boardDir, 'events.jsonl'), '', 'utf8');
			await fs.writeFile(path.join(taskDir, 'events.jsonl'), '', 'utf8');
			await fs.writeFile(path.join(taskDir, 'task.json'), JSON.stringify({
				schema: 'mpi-kanban/task-card/v1',
				id: 'MPI-1',
				title: 'Move task',
				column: 'todo',
				maturity: 'planned',
				status: 'active',
				created_at: '2026-05-31T00:00:00.000Z',
				updated_at: '2026-05-31T00:00:00.000Z',
				links: {
					events: 'events.jsonl',
				},
			}, null, 2), 'utf8');

			const folder: vscode.WorkspaceFolder = {
				uri: vscode.Uri.file(tempDir),
				name: 'json-board',
				index: 0,
			};
			const store = new TaskBoardStore(folder);
			await store.moveTask('MPI-1', 'todo', 'doing', 0);
			let task = JSON.parse(await fs.readFile(path.join(taskDir, 'task.json'), 'utf8'));
			assert.strictEqual(task.column, 'doing');
			assert.strictEqual(task.maturity, 'in-progress');
			assert.strictEqual(task.status, 'active');

			await store.moveTask('MPI-1', 'doing', 'done', 0);
			task = JSON.parse(await fs.readFile(path.join(taskDir, 'task.json'), 'utf8'));
			assert.strictEqual(task.column, 'done');
			assert.strictEqual(task.maturity, 'complete');
			assert.strictEqual(task.status, 'completed');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
