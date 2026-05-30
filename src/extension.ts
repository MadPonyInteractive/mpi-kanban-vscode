import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';
import { TaskBoardStore } from './taskBoardStore';

const OPEN_COMMAND = 'mpi-kanban.openKanban';
const OPEN_TASK_COMMAND = 'mpi-kanban.openTaskById';
const INSTALL_SKILLS_COMMAND = 'mpi-kanban.installSkills';
const CONTEXT_KEY = 'mpiKanbanActive';
const MIGRATE_ACTION = 'Migrate to JSON Board';

async function resolveStore(uri?: vscode.Uri): Promise<TaskBoardStore | undefined> {
	const folder = TaskBoardStore.findWorkspaceFolder(uri);
	if (!folder) {
		vscode.window.showErrorMessage('Open a workspace before opening Mpi-Kanban.');
		return undefined;
	}

	const store = new TaskBoardStore(folder);
	if (!await store.exists()) {
		const legacyBoard = await store.findLegacyBoard();
		if (legacyBoard) {
			const choice = await vscode.window.showWarningMessage(
				`Mpi-Kanban found legacy ${legacyBoard.relativePath}. Migration will create .agents/mpi-kanban/board.json, events.jsonl, tasks/MPI-*/ files, and a legacy snapshot without modifying or deleting the source board.`,
				{ modal: true },
				MIGRATE_ACTION
			);

			if (choice === MIGRATE_ACTION) {
				try {
					await store.migrateLegacyBoard(legacyBoard);
					await vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);
					vscode.window.showInformationMessage('Migrated legacy Mpi-Kanban board to .agents/mpi-kanban/board.json.');
					return store;
				} catch (error) {
					vscode.window.showErrorMessage(`Mpi-Kanban migration failed: ${error}`);
				}
			}

			await vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
			return undefined;
		}

		vscode.window.showErrorMessage('Mpi-Kanban could not find .agents/mpi-kanban/board.json in this workspace.');
		await vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
		return undefined;
	}

	await vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);
	return store;
}

async function openWorkspaceKanban(context: vscode.ExtensionContext, uri?: vscode.Uri) {
	const store = await resolveStore(uri);
	if (!store) {
		return;
	}

	try {
		await KanbanWebviewPanel.createOrShow(context.extensionUri, context, store);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open Mpi-Kanban board: ${error}`);
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Mpi-Kanban extension is now active.');
	let reloadTimer: NodeJS.Timeout | undefined;
	let lastSeenMtime = 0;

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(KanbanWebviewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				const panel = KanbanWebviewPanel.revive(webviewPanel, context.extensionUri, context);
				const store = await resolveStore();

				if (!store) {
					return;
				}

				await panel.loadTaskBoard(store);
			}
		});
	}

	const openKanbanCommand = vscode.commands.registerCommand(OPEN_COMMAND, async (uri?: vscode.Uri) => {
		await openWorkspaceKanban(context, uri);
	});

	const openTaskCommand = vscode.commands.registerCommand(OPEN_TASK_COMMAND, async () => {
		const store = await resolveStore();
		if (!store) {
			return;
		}

		const taskId = await vscode.window.showInputBox({
			prompt: 'Open MPI task by ID',
			placeHolder: 'MPI-42',
			validateInput: value => /^MPI-\d+$/.test(value.trim()) ? undefined : 'Enter an ID like MPI-42.',
		});

		if (!taskId) {
			return;
		}

		await store.openTaskLink(taskId.trim(), 'plan');
	});

	const installSkillsCommand = vscode.commands.registerCommand(INSTALL_SKILLS_COMMAND, async () => {
		const terminal = vscode.window.createTerminal('Mpi-Kanban Skills');
		terminal.sendText('npx skills add MadPonyInteractive/mpi-kanban --all -y -g');
		terminal.show();
	});

	const boardWatcher = vscode.workspace.createFileSystemWatcher('**/.agents/mpi-kanban/board.json');
	const taskWatcher = vscode.workspace.createFileSystemWatcher('**/.agents/mpi-kanban/tasks/*/task.json');

	const reloadBoard = async () => {
		try {
			const store = await resolveStore();
			if (store && KanbanWebviewPanel.currentPanel) {
				await KanbanWebviewPanel.currentPanel.loadTaskBoard(store);
				const stat = await vscode.workspace.fs.stat(store.boardUri);
				lastSeenMtime = stat.mtime;
			}
		} catch (error) {
			console.error('Failed to reload Mpi-Kanban board:', error);
		}
	};

	const scheduleReloadBoard = () => {
		if (reloadTimer) {
			clearTimeout(reloadTimer);
		}

		reloadTimer = setTimeout(() => {
			void reloadBoard();
		}, 100);
	};

	const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
		if (document.uri.fsPath.endsWith('task.json') || document.uri.fsPath.endsWith('board.json')) {
			void reloadBoard();
		}
	});

	const pollForExternalChanges = setInterval(() => {
		if (!KanbanWebviewPanel.currentPanel) {
			return;
		}

		void (async () => {
			try {
				const store = await resolveStore();
				if (!store) {
					return;
				}

				const stat = await vscode.workspace.fs.stat(store.boardUri);
				if (lastSeenMtime !== 0 && stat.mtime === lastSeenMtime) {
					return;
				}

				lastSeenMtime = stat.mtime;
				scheduleReloadBoard();
			} catch {
				// Ignore transient file access errors during external writes.
			}
		})();
	}, 2000);

	context.subscriptions.push(
		openKanbanCommand,
		openTaskCommand,
		installSkillsCommand,
		boardWatcher,
		taskWatcher,
		boardWatcher.onDidCreate(scheduleReloadBoard),
		boardWatcher.onDidChange(scheduleReloadBoard),
		boardWatcher.onDidDelete(async () => {
			await vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
		}),
		taskWatcher.onDidCreate(scheduleReloadBoard),
		taskWatcher.onDidChange(scheduleReloadBoard),
		taskWatcher.onDidDelete(scheduleReloadBoard),
		saveListener,
		new vscode.Disposable(() => clearInterval(pollForExternalChanges)),
	);

	void resolveStore();
}

export function deactivate() {
	void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
}

