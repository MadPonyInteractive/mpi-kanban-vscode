import * as vscode from 'vscode';
import { KanbanTask, MarkdownKanbanParser } from './markdownParser';

export type TaskColumnId = 'todo' | 'doing' | 'done';
const TODO_MATURITIES = new Set(['idea', 'planned']);

export interface TaskBoardIndex {
	schema: 'mpi-kanban/board/v1';
	next_id: number;
	columns: Record<TaskColumnId, string[]>;
}

export interface TaskAttention {
	state: 'required' | 'cleared';
	reason?: string;
	updated_at: string;
}

export interface TaskCardLinks {
	brief?: string;
	plan?: string;
	checklist?: string;
	validation?: string;
	files?: string;
	events?: string;
	handoffs?: string;
	research?: string;
}

export interface TaskCard {
	schema: 'mpi-kanban/task-card/v1';
	id: string;
	title: string;
	description?: string;
	column: TaskColumnId;
	maturity?: string;
	status?: string;
	attention?: TaskAttention;
	activeSessionTitle?: string;
	created_at: string;
	updated_at: string;
	links: TaskCardLinks;
}

export interface ChecklistItem {
	text: string;
	completed: boolean;
	line?: number;
}

export interface WebviewTask extends TaskCard {
	checklist: ChecklistItem[];
}

export interface WebviewColumn {
	id: TaskColumnId;
	title: string;
	tasks: WebviewTask[];
}

export interface WebviewBoard {
	title: string;
	workspaceName: string;
	workspaceMember: WebviewWorkspaceMember;
	columns: WebviewColumn[];
}

export interface WebviewWorkspaceMember {
	name: string;
	index: number;
	uri: string;
	fsPath?: string;
	boardPath: string;
	isSelected: true;
}

export interface TaskInput {
	title: string;
	description?: string;
}

export interface LegacyBoardInfo {
	uri: vscode.Uri;
	relativePath: string;
}

export interface KanbanWorkspaceCandidate {
	workspaceFolder: vscode.WorkspaceFolder;
	hasBoard: boolean;
	legacyBoard?: LegacyBoardInfo;
	hasRelatedDirectory: boolean;
}

interface EventPayload {
	type: string;
	id: string;
	at: string;
	actor: string;
	summary: string;
	from?: TaskColumnId;
	to?: TaskColumnId;
}

interface ParsedChecklistItem extends ChecklistItem {
	line: number;
}

const BOARD_RELATIVE_PATH = ['.agents', 'mpi-kanban', 'board.json'];
const BOARD_RELATIVE_DISPLAY_PATH = BOARD_RELATIVE_PATH.join('/');
const LEGACY_BOARD_RELATIVE_PATHS = [
	['.agents', 'mpi-kanban', 'kanban.md'],
	['.claude', 'mpi-kanban', 'kanban.md'],
];
const RELATED_DIRECTORY_RELATIVE_PATHS = [
	['.agents', 'mpi-kanban'],
	['.claude', 'mpi-kanban'],
];
const TASKS_RELATIVE_PATH = ['.agents', 'mpi-kanban', 'tasks'];
const EVENTS_RELATIVE_PATH = ['.agents', 'mpi-kanban', 'events.jsonl'];
const LEGACY_SNAPSHOT_RELATIVE_PATH = ['.agents', 'mpi-kanban', 'legacy'];
const COLUMN_LABELS: Record<TaskColumnId, string> = {
	todo: 'To do',
	doing: 'Doing',
	done: 'Done',
};
const COLUMN_IDS: TaskColumnId[] = ['todo', 'doing', 'done'];

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function isFileNotFound(error: unknown): boolean {
	if (error instanceof vscode.FileSystemError) {
		return error.code === 'FileNotFound';
	}
	return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ENOENT');
}

export function mapLegacyColumn(columnTitle: string): { column: TaskColumnId; maturity: string; status: string } {
	switch (columnTitle.trim().toUpperCase()) {
		case 'BACKLOG':
			return { column: 'todo', maturity: 'idea', status: 'active' };
		case 'PLANNING':
			return { column: 'todo', maturity: 'planned', status: 'active' };
		case 'IMPLEMENTING':
			return { column: 'doing', maturity: 'in-progress', status: 'active' };
		case 'VALIDATING':
			return { column: 'doing', maturity: 'validating', status: 'active' };
		case 'COMPLETED':
			return { column: 'done', maturity: 'complete', status: 'accepted' };
		default:
			return { column: 'todo', maturity: 'planned', status: 'active' };
	}
}

export function extractPlanFilePath(text?: string): string | undefined {
	const match = text?.match(/(?:^|\n)\s*Plan file:\s*(.+?)\s*(?:\n|$)/i);
	return match?.[1]?.trim();
}

export class TaskBoardStore {
	public readonly workspaceFolder: vscode.WorkspaceFolder;

	public constructor(workspaceFolder: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
	}

	public get boardUri(): vscode.Uri {
		return vscode.Uri.joinPath(this.workspaceFolder.uri, ...BOARD_RELATIVE_PATH);
	}

	public get eventsUri(): vscode.Uri {
		return vscode.Uri.joinPath(this.workspaceFolder.uri, ...EVENTS_RELATIVE_PATH);
	}

	public static findWorkspaceFolder(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return undefined;
		}

		if (uri) {
			return vscode.workspace.getWorkspaceFolder(uri);
		}

		return folders[0];
	}

	public static async findWorkspaceCandidates(): Promise<KanbanWorkspaceCandidate[]> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		return Promise.all(folders.map(async workspaceFolder => {
			const store = new TaskBoardStore(workspaceFolder);
			const [hasBoard, legacyBoard, hasRelatedDirectory] = await Promise.all([
				store.exists(),
				store.findLegacyBoard(),
				TaskBoardStore.hasRelatedDirectory(workspaceFolder),
			]);

			return {
				workspaceFolder,
				hasBoard,
				legacyBoard,
				hasRelatedDirectory,
			};
		}));
	}

	public static matchesWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder, value?: string): boolean {
		const candidate = value?.trim();
		if (!candidate) {
			return false;
		}

		return [
			workspaceFolder.uri.toString(),
			workspaceFolder.uri.fsPath,
			workspaceFolder.name,
		].some(identifier => identifier.localeCompare(candidate, undefined, { sensitivity: 'accent' }) === 0);
	}

	public static workspaceFolderSettingValue(workspaceFolder: vscode.WorkspaceFolder): string {
		return workspaceFolder.uri.toString();
	}

	private static async hasRelatedDirectory(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
		for (const relativePathParts of RELATED_DIRECTORY_RELATIVE_PATHS) {
			try {
				const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, ...relativePathParts));
				if ((stat.type & vscode.FileType.Directory) !== 0) {
					return true;
				}
			} catch {
				// Keep looking for supported MPI workspace directories.
			}
		}

		return false;
	}

	public async exists(): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(this.boardUri);
			return true;
		} catch {
			return false;
		}
	}

	public async findLegacyBoard(): Promise<LegacyBoardInfo | undefined> {
		for (const relativePathParts of LEGACY_BOARD_RELATIVE_PATHS) {
			const uri = vscode.Uri.joinPath(this.workspaceFolder.uri, ...relativePathParts);
			try {
				await vscode.workspace.fs.stat(uri);
				return {
					uri,
					relativePath: relativePathParts.join('/'),
				};
			} catch {
				// Keep looking for supported legacy locations.
			}
		}

		return undefined;
	}

	public workspaceMemberMetadata(): WebviewWorkspaceMember {
		return {
			name: this.workspaceFolder.name,
			index: this.workspaceFolder.index,
			uri: this.workspaceFolder.uri.toString(),
			fsPath: this.workspaceFolder.uri.scheme === 'file' ? this.workspaceFolder.uri.fsPath : undefined,
			boardPath: BOARD_RELATIVE_DISPLAY_PATH,
			isSelected: true,
		};
	}

	public async migrateLegacyBoard(legacyBoardInfo?: LegacyBoardInfo): Promise<WebviewBoard> {
		if (await this.exists()) {
			throw new Error('.agents/mpi-kanban/board.json already exists. Stop and merge manually instead of importing over it.');
		}

		const source = legacyBoardInfo ?? await this.findLegacyBoard();
		if (!source) {
			throw new Error('No legacy kanban.md board was found.');
		}

		const now = new Date().toISOString();
		const legacyMarkdown = await this.readText(source.uri);
		const legacyBoard = MarkdownKanbanParser.parseMarkdown(legacyMarkdown);
		const board: TaskBoardIndex = {
			schema: 'mpi-kanban/board/v1',
			next_id: 1,
			columns: {
				todo: [],
				doing: [],
				done: [],
			},
		};

		await this.ensureDirectory(vscode.Uri.joinPath(this.workspaceFolder.uri, ...TASKS_RELATIVE_PATH));
		await this.ensureDirectory(vscode.Uri.joinPath(this.workspaceFolder.uri, ...LEGACY_SNAPSHOT_RELATIVE_PATH));
		await this.writeText(this.eventsUri, '');
		await this.appendEvent({
			type: 'migration.started',
			id: 'MPI-0',
			at: now,
			actor: 'vscode',
			summary: `Started migration from ${source.relativePath}.`,
		});

		const snapshotName = `kanban-${this.timestampForFile(now)}.md`;
		await this.writeText(vscode.Uri.joinPath(this.workspaceFolder.uri, ...LEGACY_SNAPSHOT_RELATIVE_PATH, snapshotName), legacyMarkdown);

		for (const column of legacyBoard.columns) {
			const mapping = mapLegacyColumn(column.title);

			for (const legacyTask of column.tasks) {
				const id = `MPI-${board.next_id}`;
				board.next_id += 1;
				board.columns[mapping.column].push(id);

				const task: TaskCard = {
					schema: 'mpi-kanban/task-card/v1',
					id,
					title: legacyTask.title,
					description: this.shortDescription(legacyTask),
					column: mapping.column,
					maturity: mapping.maturity,
					status: mapping.status,
					created_at: now,
					updated_at: now,
					links: this.defaultLinks(),
				};

				await this.ensureTaskFolder(id);
				await this.writeTask(task);
				await this.writeLegacyTaskFiles(id, legacyTask, column.title);
				await this.appendEvent({
					type: 'migration.task_imported',
					id,
					at: now,
					actor: 'vscode',
					summary: `Imported ${id} from ${source.relativePath} ${column.title}.`,
				}, id);
			}
		}

		await this.writeBoard(board);
		await this.appendEvent({
			type: 'migration.completed',
			id: 'MPI-0',
			at: now,
			actor: 'vscode',
			summary: `Completed migration from ${source.relativePath}; legacy snapshot: .agents/mpi-kanban/legacy/${snapshotName}.`,
		});

		return this.loadWebviewBoard();
	}

	public async loadWebviewBoard(): Promise<WebviewBoard> {
		const board = await this.readBoard();
		const columns: WebviewColumn[] = [];

		for (const columnId of COLUMN_IDS) {
			const tasks = await Promise.all(
				board.columns[columnId].map(async taskId => {
					const task = await this.readTask(taskId);
					const checklist = await this.readChecklist(task);
					return { ...task, checklist };
				})
			);

			columns.push({
				id: columnId,
				title: COLUMN_LABELS[columnId],
				tasks,
			});
		}

		return {
			title: 'Mpi-Kanban',
			workspaceName: this.workspaceFolder.name,
			workspaceMember: this.workspaceMemberMetadata(),
			columns,
		};
	}

	public async createTask(input: TaskInput): Promise<WebviewBoard> {
		const board = await this.readBoard();
		const now = new Date().toISOString();
		const id = `MPI-${board.next_id}`;
		board.next_id += 1;
		board.columns.todo.push(id);

		const task: TaskCard = {
			schema: 'mpi-kanban/task-card/v1',
			id,
			title: input.title,
			description: input.description || undefined,
			column: 'todo',
			maturity: 'idea',
			status: 'pending',
			created_at: now,
			updated_at: now,
			links: this.defaultLinks(),
		};

		await this.ensureTaskFolder(id);
		await this.writeTask(task);
		await this.writeBoard(board);
		await this.appendEvent({ type: 'task.created', id, at: now, actor: 'vscode', summary: `Created ${id}.` });
		return this.loadWebviewBoard();
	}

	public async updateTask(taskId: string, input: TaskInput): Promise<WebviewBoard> {
		const task = await this.readTask(taskId);
		task.title = input.title;
		task.description = input.description || undefined;
		task.updated_at = new Date().toISOString();
		await this.writeTask(task);
		await this.appendEvent({
			type: 'task.updated',
			id: taskId,
			at: task.updated_at,
			actor: 'vscode',
			summary: `Updated ${taskId}.`,
		});
		return this.loadWebviewBoard();
	}

	public async toggleChecklistItem(
		taskId: string,
		itemIndex: number,
		completed: boolean,
		expected?: { text?: string; completed?: boolean }
	): Promise<WebviewBoard> {
		const task = await this.readTask(taskId);
		const checklistPath = task.links.checklist;
		if (!checklistPath) {
			throw new Error(`${taskId} has no checklist link.`);
		}

		const uri = vscode.Uri.joinPath(this.taskFolderUri(taskId), ...checklistPath.split('/').filter(Boolean));
		const content = await this.readText(uri);
		const lines = content.split(/\r?\n/);
		const items = this.parseChecklistLines(lines);
		const item = items[itemIndex];
		if (!item) {
			throw new Error(`${taskId} checklist item ${itemIndex + 1} was not found. Reload the board and try again.`);
		}

		if (
			(expected?.text !== undefined && expected.text !== item.text) ||
			(expected?.completed !== undefined && expected.completed !== item.completed)
		) {
			throw new Error(`${taskId} checklist changed on disk. Reload the board and try again.`);
		}

		const match = lines[item.line].match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.+)$/);
		if (!match) {
			throw new Error(`${taskId} checklist item ${itemIndex + 1} can no longer be toggled.`);
		}

		const now = new Date().toISOString();
		lines[item.line] = `${match[1]}${completed ? 'x' : ' '}${match[3]}`;
		await this.writeText(uri, lines.join('\n'));

		task.updated_at = now;
		await this.writeTask(task);
		await this.appendEvent({
			type: completed ? 'checklist.item_checked' : 'checklist.item_unchecked',
			id: taskId,
			at: now,
			actor: 'user',
			summary: `${completed ? 'Checked' : 'Unchecked'} checklist item ${itemIndex + 1} for ${taskId}: ${item.text}`,
		}, taskId);

		return this.loadWebviewBoard();
	}

	public async deleteTask(taskId: string): Promise<WebviewBoard> {
		const board = await this.readBoard();
		const now = new Date().toISOString();

		for (const columnId of COLUMN_IDS) {
			board.columns[columnId] = board.columns[columnId].filter(id => id !== taskId);
		}

		const task = await this.readTask(taskId);
		task.status = 'deleted';
		task.updated_at = now;
		await this.writeTask(task);
		await this.writeBoard(board);
		await this.appendEvent({ type: 'task.deleted', id: taskId, at: now, actor: 'vscode', summary: `Deleted ${taskId}.` });
		return this.loadWebviewBoard();
	}

	public async moveTask(taskId: string, fromColumnId: TaskColumnId, toColumnId: TaskColumnId, newIndex: number): Promise<WebviewBoard> {
		const board = await this.readBoard();
		const actualFromColumnId = this.findTaskColumn(board, taskId) ?? fromColumnId;
		const from = board.columns[actualFromColumnId];
		const to = board.columns[toColumnId];
		const currentIndex = from.indexOf(taskId);
		const now = new Date().toISOString();

		if (currentIndex === -1) {
			throw new Error(`Task ${taskId} is not in any board column.`);
		}

		from.splice(currentIndex, 1);
		const boundedIndex = Math.max(0, Math.min(newIndex, to.length));
		to.splice(boundedIndex, 0, taskId);

		const task = await this.readTask(taskId);
		task.column = toColumnId;
		task.updated_at = now;
		this.applyMoveSummary(task, actualFromColumnId, toColumnId, now);

		await this.writeBoard(board);
		await this.writeTask(task);
		await this.appendEvent({
			type: 'task.moved',
			id: taskId,
			at: now,
			actor: 'vscode',
			from: actualFromColumnId,
			to: toColumnId,
			summary: `Moved ${taskId} from ${COLUMN_LABELS[actualFromColumnId]} to ${COLUMN_LABELS[toColumnId]}.`,
		});

		if (task.attention?.state === 'required') {
			await this.appendEvent({
				type: 'attention.required',
				id: taskId,
				at: now,
				actor: 'vscode',
				summary: task.attention.reason ?? `${taskId} requires attention.`,
			}, taskId);
		} else if (task.attention?.state === 'cleared') {
			await this.appendEvent({
				type: 'attention.cleared',
				id: taskId,
				at: now,
				actor: 'vscode',
				summary: `Cleared attention for ${taskId}.`,
			}, taskId);
		}

		return this.loadWebviewBoard();
	}

	public async openTaskLink(taskId: string, linkKey: keyof TaskCardLinks): Promise<void> {
		const task = await this.readTask(taskId);
		const relativePath = task.links[linkKey];
		if (!relativePath) {
			throw new Error(`${taskId} has no ${String(linkKey)} link.`);
		}

		const target = vscode.Uri.joinPath(this.taskFolderUri(taskId), ...relativePath.split('/').filter(Boolean));
		if (relativePath.endsWith('/')) {
			await this.ensureDirectory(target);
			await vscode.commands.executeCommand('revealFileInOS', target);
			return;
		}

		try {
			await vscode.workspace.fs.stat(target);
		} catch {
			await this.writeText(target, this.defaultLinkedFileContent(taskId, linkKey));
		}

		await vscode.window.showTextDocument(target, { preview: false });
	}

	public async openTaskFolder(taskId: string): Promise<void> {
		await vscode.commands.executeCommand('revealFileInOS', this.taskFolderUri(taskId));
	}

	private async readBoard(): Promise<TaskBoardIndex> {
		const board = await this.readJson<TaskBoardIndex>(this.boardUri);
		this.validateBoard(board);
		return board;
	}

	private async writeBoard(board: TaskBoardIndex): Promise<void> {
		await this.writeJson(this.boardUri, board);
	}

	private async readTask(taskId: string): Promise<TaskCard> {
		// Agents write board.json and tasks/<id>/task.json as separate files, so a
		// new task ID can appear in board.json a few ms before its task.json is
		// visible. Retry briefly on file-not-found to heal that race; a task file
		// that is still missing after the retry budget surfaces normally.
		const task = await this.readTaskJsonWithRetry(taskId);
		if (task.schema !== 'mpi-kanban/task-card/v1') {
			throw new Error(`${taskId} has unsupported task schema.`);
		}
		return task;
	}

	private async readTaskJsonWithRetry(taskId: string): Promise<TaskCard> {
		const attempts = 3;
		const delayMs = 150;
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.readJson<TaskCard>(this.taskJsonUri(taskId));
			} catch (error) {
				if (attempt >= attempts || !isFileNotFound(error)) {
					throw error;
				}
				await delay(delayMs);
			}
		}
	}

	private async writeTask(task: TaskCard): Promise<void> {
		await this.ensureTaskFolder(task.id);
		await this.writeJson(this.taskJsonUri(task.id), task);
	}

	private async readChecklist(task: TaskCard): Promise<ChecklistItem[]> {
		const checklistPath = task.links.checklist;
		if (!checklistPath) {
			return [];
		}

		try {
			const uri = vscode.Uri.joinPath(this.taskFolderUri(task.id), ...checklistPath.split('/').filter(Boolean));
			const content = await this.readText(uri);
			return this.parseChecklistLines(content.split(/\r?\n/));
		} catch {
			return [];
		}
	}

	private parseChecklistLines(lines: string[]): ParsedChecklistItem[] {
		return lines
			.map((line, index) => {
				const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
				return match ? { completed: match[1].toLowerCase() === 'x', text: match[2].trim(), line: index } : undefined;
			})
			.filter((item): item is ParsedChecklistItem => Boolean(item));
	}

	private async readJson<T>(uri: vscode.Uri): Promise<T> {
		const content = await this.readText(uri);
		return JSON.parse(content) as T;
	}

	private async writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
		await this.writeText(uri, `${JSON.stringify(value, null, 2)}\n`);
	}

	private async readText(uri: vscode.Uri): Promise<string> {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(bytes).toString('utf8');
	}

	private async writeText(uri: vscode.Uri, content: string): Promise<void> {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
	}

	private async appendEvent(event: EventPayload, taskId?: string): Promise<void> {
		const line = `${JSON.stringify({ schema: 'mpi-kanban/event/v1', ...event })}\n`;
		await this.appendText(this.eventsUri, line);

		const targetTaskId = taskId ?? (/^MPI-[1-9][0-9]*$/.test(event.id) ? event.id : undefined);
		if (targetTaskId) {
			await this.appendText(this.taskEventsUri(targetTaskId), line);
		}
	}

	private async appendText(uri: vscode.Uri, text: string): Promise<void> {
		let existing = '';
		try {
			existing = await this.readText(uri);
		} catch {
			await this.ensureDirectory(vscode.Uri.joinPath(uri, '..'));
		}
		await this.writeText(uri, `${existing}${text}`);
	}

	private validateBoard(board: TaskBoardIndex): void {
		if (board.schema !== 'mpi-kanban/board/v1') {
			throw new Error('Unsupported board schema.');
		}

		for (const columnId of COLUMN_IDS) {
			if (!Array.isArray(board.columns[columnId])) {
				throw new Error(`Board is missing ${columnId} column.`);
			}
		}
	}

	private findTaskColumn(board: TaskBoardIndex, taskId: string): TaskColumnId | undefined {
		return COLUMN_IDS.find(columnId => board.columns[columnId].includes(taskId));
	}

	private applyMoveSummary(task: TaskCard, fromColumnId: TaskColumnId, toColumnId: TaskColumnId, now: string): void {
		if (toColumnId === 'doing') {
			task.status = 'active';
			task.maturity = task.maturity === 'validating' ? 'validating' : 'in-progress';
		} else if (toColumnId === 'done') {
			task.status = 'completed';
			task.maturity = 'complete';
			task.attention = { state: 'cleared', updated_at: now };
		} else if (toColumnId === 'todo') {
			task.status = 'pending';
			task.maturity = TODO_MATURITIES.has(task.maturity ?? '') ? task.maturity : 'planned';
		}

		if (fromColumnId === 'done' && toColumnId === 'doing') {
			task.attention = {
				state: 'required',
				reason: 'Reopened from Done; agent reconciliation may be needed.',
				updated_at: now,
			};
		} else if (fromColumnId === 'doing' && toColumnId === 'todo') {
			task.attention = {
				state: 'required',
				reason: 'Moved back to To do; reconcile active work state.',
				updated_at: now,
			};
		}
	}

	private defaultLinks(): Required<TaskCardLinks> {
		return {
			brief: 'brief.md',
			plan: 'plan.md',
			checklist: 'checklist.md',
			validation: 'validation.md',
			files: 'files.json',
			events: 'events.jsonl',
			handoffs: 'handoffs/',
			research: 'research/',
		};
	}

	private async writeLegacyTaskFiles(taskId: string, legacyTask: KanbanTask, legacyColumn: string): Promise<void> {
		const planFile = extractPlanFilePath(legacyTask.description);
		const legacyEntry = MarkdownKanbanParser.generateMarkdown({
			title: 'Legacy Markdown Entry',
			columns: [{
				id: legacyColumn.toLowerCase(),
				title: legacyColumn,
				tasks: [legacyTask],
			}],
		});

		await this.writeText(
			vscode.Uri.joinPath(this.taskFolderUri(taskId), 'brief.md'),
			`# Brief\n\nTask: ${taskId}\n\n## Legacy Markdown Entry\n\n${legacyEntry}`
		);
		await this.writeText(
			vscode.Uri.joinPath(this.taskFolderUri(taskId), 'plan.md'),
			planFile ? `# Plan\n\nTask: ${taskId}\n\nLegacy plan file: ${planFile}\n` : `# Plan\n\nTask: ${taskId}\n`
		);
		await this.writeText(
			vscode.Uri.joinPath(this.taskFolderUri(taskId), 'checklist.md'),
			this.legacyChecklist(taskId, legacyTask)
		);
		await this.writeText(
			vscode.Uri.joinPath(this.taskFolderUri(taskId), 'validation.md'),
			`# Validation\n\nTask: ${taskId}\n`
		);
		await this.writeText(
			vscode.Uri.joinPath(this.taskFolderUri(taskId), 'files.json'),
			'[]\n'
		);
		await this.writeText(this.taskEventsUri(taskId), '');
	}

	private shortDescription(task: KanbanTask): string | undefined {
		return task.description
			?.split(/\r?\n/)
			.map(line => line.trim())
			.find(line => line.length > 0 && !/^Plan file:/i.test(line));
	}

	private legacyChecklist(taskId: string, task: KanbanTask): string {
		if (!task.steps || task.steps.length === 0) {
			return `# Checklist\n\nTask: ${taskId}\n`;
		}

		const lines = task.steps.map(step => `- [${step.completed ? 'x' : ' '}] ${step.text}`);
		return `# Checklist\n\nTask: ${taskId}\n\n${lines.join('\n')}\n`;
	}

	private timestampForFile(value: string): string {
		return value.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace(/\.\d+[+-]\d{2}:\d{2}$/, '').replace(/[TZ]/g, '-').replace(/-$/, '');
	}

	private defaultLinkedFileContent(taskId: string, linkKey: keyof TaskCardLinks): string {
		if (linkKey === 'events') {
			return '';
		}

		const title = String(linkKey).charAt(0).toUpperCase() + String(linkKey).slice(1);
		return `# ${title}\n\nTask: ${taskId}\n`;
	}

	private taskFolderUri(taskId: string): vscode.Uri {
		return vscode.Uri.joinPath(this.workspaceFolder.uri, ...TASKS_RELATIVE_PATH, taskId);
	}

	private taskJsonUri(taskId: string): vscode.Uri {
		return vscode.Uri.joinPath(this.taskFolderUri(taskId), 'task.json');
	}

	private taskEventsUri(taskId: string): vscode.Uri {
		return vscode.Uri.joinPath(this.taskFolderUri(taskId), 'events.jsonl');
	}

	private async ensureTaskFolder(taskId: string): Promise<void> {
		await this.ensureDirectory(this.taskFolderUri(taskId));
		await this.ensureDirectory(vscode.Uri.joinPath(this.taskFolderUri(taskId), 'handoffs'));
		await this.ensureDirectory(vscode.Uri.joinPath(this.taskFolderUri(taskId), 'research'));
	}

	private async ensureDirectory(uri: vscode.Uri): Promise<void> {
		try {
			await vscode.workspace.fs.createDirectory(uri);
		} catch {
			// The directory may already exist or the provider may have created it.
		}
	}
}
