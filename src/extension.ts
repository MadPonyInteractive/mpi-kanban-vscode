import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';
import { KanbanWorkspaceCandidate, TaskBoardStore } from './taskBoardStore';

const OPEN_COMMAND = 'mpi-kanban.openKanban';
const OPEN_TASK_COMMAND = 'mpi-kanban.openTaskById';
const INSTALL_SKILLS_COMMAND = 'mpi-kanban.installSkills';
const CONTEXT_KEY = 'mpiKanbanActive';
const MIGRATE_ACTION = 'Migrate to JSON Board';
const SELECT_ROOT_ACTION = 'Select Kanban Root';
const INSTALL_SKILLS_ACTION = 'Install or Update Skills';
const CONFIG_SECTION = 'mpi-kanban';
const KANBAN_ROOT_SETTING = 'kanbanRoot';
const KANBAN_ROOT_CONFIG = `${CONFIG_SECTION}.${KANBAN_ROOT_SETTING}`;

interface ResolveStoreOptions {
	uri?: vscode.Uri;
	allowPrompt?: boolean;
	showSetupMessages?: boolean;
}

function workspaceFoldersEqual(left: vscode.WorkspaceFolder, right: vscode.WorkspaceFolder): boolean {
	return left.uri.toString() === right.uri.toString();
}

function configuredKanbanRoot(): string {
	return vscode.workspace.getConfiguration(CONFIG_SECTION).inspect<string>(KANBAN_ROOT_SETTING)?.workspaceValue ?? '';
}

async function persistKanbanRoot(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	await vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.update(KANBAN_ROOT_SETTING, TaskBoardStore.workspaceFolderSettingValue(workspaceFolder), vscode.ConfigurationTarget.Workspace);
}

async function refreshContextKey(candidates?: KanbanWorkspaceCandidate[]): Promise<void> {
	const resolvedCandidates = candidates ?? await TaskBoardStore.findWorkspaceCandidates();
	await vscode.commands.executeCommand('setContext', CONTEXT_KEY, resolvedCandidates.some(candidate => candidate.hasBoard));
}

function candidateDescription(candidate: KanbanWorkspaceCandidate): string {
	if (candidate.workspaceFolder.uri.scheme === 'file') {
		return candidate.workspaceFolder.uri.fsPath;
	}

	return candidate.workspaceFolder.uri.toString();
}

async function pickCandidate(candidates: KanbanWorkspaceCandidate[], placeHolder: string): Promise<KanbanWorkspaceCandidate | undefined> {
	const selected = await vscode.window.showQuickPick(
		candidates.map(candidate => ({
			label: candidate.workspaceFolder.name,
			description: candidate.hasBoard ? '.agents/mpi-kanban/board.json' : candidate.legacyBoard?.relativePath ?? 'MPI workspace folder',
			detail: candidateDescription(candidate),
			candidate,
		})),
		{ placeHolder }
	);

	return selected?.candidate;
}

export function primaryWorkspaceCandidate(candidates: KanbanWorkspaceCandidate[]): KanbanWorkspaceCandidate | undefined {
	return candidates.find(candidate => candidate.workspaceFolder.index === 0) ?? candidates[0];
}

export function preferredPrimaryWorkspaceCandidate(candidates: KanbanWorkspaceCandidate[]): KanbanWorkspaceCandidate | undefined {
	const primaryCandidate = primaryWorkspaceCandidate(candidates);
	if (primaryCandidate?.hasBoard || primaryCandidate?.legacyBoard) {
		return primaryCandidate;
	}

	return undefined;
}

async function migrateLegacyStore(store: TaskBoardStore, legacyBoard = store.findLegacyBoard()): Promise<TaskBoardStore | undefined> {
	const resolvedLegacyBoard = await legacyBoard;
	if (!resolvedLegacyBoard) {
		return undefined;
	}

	const choice = await vscode.window.showWarningMessage(
		`Mpi-Kanban found legacy ${resolvedLegacyBoard.relativePath} in ${store.workspaceFolder.name}. Migration will create .agents/mpi-kanban/board.json, events.jsonl, tasks/MPI-*/ files, and a legacy snapshot without modifying or deleting the source board.`,
		{ modal: true },
		MIGRATE_ACTION
	);

	if (choice !== MIGRATE_ACTION) {
		await refreshContextKey();
		return undefined;
	}

	try {
		await store.migrateLegacyBoard(resolvedLegacyBoard);
		await persistKanbanRoot(store.workspaceFolder);
		await refreshContextKey();
		vscode.window.showInformationMessage(`Migrated ${store.workspaceFolder.name} to .agents/mpi-kanban/board.json.`);
		return store;
	} catch (error) {
		vscode.window.showErrorMessage(`Mpi-Kanban migration failed: ${error}`);
		await refreshContextKey();
		return undefined;
	}
}

async function showSetupAction(candidates: KanbanWorkspaceCandidate[]): Promise<void> {
	const relatedCandidates = candidates.filter(candidate => candidate.hasRelatedDirectory || candidate.legacyBoard);
	if (relatedCandidates.length === 0) {
		vscode.window.showErrorMessage('Mpi-Kanban could not find .agents/mpi-kanban/board.json in any workspace folder.');
		return;
	}

	const choice = await vscode.window.showWarningMessage(
		'Mpi-Kanban found MPI workspace folders but no JSON board. Install or update the skills pack, or select a legacy root to migrate when a kanban.md board is present.',
		SELECT_ROOT_ACTION,
		INSTALL_SKILLS_ACTION
	);

	if (choice === INSTALL_SKILLS_ACTION) {
		await vscode.commands.executeCommand(INSTALL_SKILLS_COMMAND);
	} else if (choice === SELECT_ROOT_ACTION) {
		const selected = await pickCandidate(relatedCandidates, 'Select the Mpi-Kanban workspace root');
		if (selected?.legacyBoard) {
			await migrateLegacyStore(new TaskBoardStore(selected.workspaceFolder), Promise.resolve(selected.legacyBoard));
		}
	}
}

async function resolveStore(options: ResolveStoreOptions = {}): Promise<TaskBoardStore | undefined> {
	const allowPrompt = options.allowPrompt ?? true;
	const showSetupMessages = options.showSetupMessages ?? true;
	const candidates = await TaskBoardStore.findWorkspaceCandidates();

	if (candidates.length === 0) {
		if (showSetupMessages) {
			vscode.window.showErrorMessage('Open a workspace before opening Mpi-Kanban.');
		}
		await refreshContextKey(candidates);
		return undefined;
	}

	if (options.uri) {
		const uriFolder = vscode.workspace.getWorkspaceFolder(options.uri);
		const uriCandidate = uriFolder
			? candidates.find(candidate => workspaceFoldersEqual(candidate.workspaceFolder, uriFolder))
			: undefined;

		if (uriCandidate?.hasBoard) {
			await persistKanbanRoot(uriCandidate.workspaceFolder);
			await refreshContextKey(candidates);
			return new TaskBoardStore(uriCandidate.workspaceFolder);
		}

		if (uriCandidate?.legacyBoard && allowPrompt && showSetupMessages) {
			return migrateLegacyStore(new TaskBoardStore(uriCandidate.workspaceFolder), Promise.resolve(uriCandidate.legacyBoard));
		}
	}

	const configuredRoot = configuredKanbanRoot();
	const configuredCandidate = candidates.find(candidate => TaskBoardStore.matchesWorkspaceFolder(candidate.workspaceFolder, configuredRoot));
	if (configuredCandidate?.hasBoard) {
		await refreshContextKey(candidates);
		return new TaskBoardStore(configuredCandidate.workspaceFolder);
	}

	const primaryCandidate = preferredPrimaryWorkspaceCandidate(candidates);
	if (primaryCandidate?.hasBoard) {
		await refreshContextKey(candidates);
		return new TaskBoardStore(primaryCandidate.workspaceFolder);
	}

	if (primaryCandidate?.legacyBoard) {
		if (allowPrompt && showSetupMessages) {
			return migrateLegacyStore(new TaskBoardStore(primaryCandidate.workspaceFolder), Promise.resolve(primaryCandidate.legacyBoard));
		}

		await refreshContextKey(candidates);
		return undefined;
	}

	const boardCandidates = candidates.filter(candidate => candidate.hasBoard);
	if (boardCandidates.length === 1) {
		await refreshContextKey(candidates);
		return new TaskBoardStore(boardCandidates[0].workspaceFolder);
	}

	if (boardCandidates.length > 1) {
		if (!allowPrompt) {
			await refreshContextKey(candidates);
			return undefined;
		}

		if (configuredCandidate && showSetupMessages) {
			void vscode.window.showWarningMessage(`Configured Mpi-Kanban root "${configuredCandidate.workspaceFolder.name}" has no .agents/mpi-kanban/board.json.`);
		}

		const selected = await pickCandidate(boardCandidates, 'Select the active Mpi-Kanban workspace root');
		if (!selected) {
			await refreshContextKey(candidates);
			return undefined;
		}

		await persistKanbanRoot(selected.workspaceFolder);
		await refreshContextKey(candidates);
		return new TaskBoardStore(selected.workspaceFolder);
	}

	const legacyCandidates = candidates.filter(candidate => candidate.legacyBoard);
	if (legacyCandidates.length === 1 && allowPrompt && showSetupMessages) {
		return migrateLegacyStore(new TaskBoardStore(legacyCandidates[0].workspaceFolder), Promise.resolve(legacyCandidates[0].legacyBoard));
	}

	if (legacyCandidates.length > 1 && allowPrompt && showSetupMessages) {
		const selected = await pickCandidate(legacyCandidates, 'Select the legacy Mpi-Kanban workspace root to migrate');
		if (selected?.legacyBoard) {
			return migrateLegacyStore(new TaskBoardStore(selected.workspaceFolder), Promise.resolve(selected.legacyBoard));
		}
	}

	if (showSetupMessages) {
		await showSetupAction(candidates);
	}
	await refreshContextKey(candidates);
	return undefined;
}

async function openWorkspaceKanban(context: vscode.ExtensionContext, uri?: vscode.Uri) {
	const store = await resolveStore({ uri, allowPrompt: true, showSetupMessages: true });
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
	let lastSeenSignature = '';

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(KanbanWebviewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				const panel = KanbanWebviewPanel.revive(webviewPanel, context.extensionUri, context);
				const store = await resolveStore({ allowPrompt: false, showSetupMessages: false });

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
		const store = await resolveStore({ allowPrompt: true, showSetupMessages: true });
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
	const checklistWatcher = vscode.workspace.createFileSystemWatcher('**/.agents/mpi-kanban/tasks/*/checklist.md');

	const reloadBoard = async () => {
		try {
			const store = await resolveStore({ allowPrompt: false, showSetupMessages: false });
			if (store && KanbanWebviewPanel.currentPanel) {
				await KanbanWebviewPanel.currentPanel.loadTaskBoard(store);
				lastSeenSignature = await store.boardSignature();
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
		const fsPath = document.uri.fsPath;
		const isMpiBoardFile = /[\\/]\.agents[\\/]mpi-kanban[\\/]/.test(fsPath)
			&& (fsPath.endsWith('task.json') || fsPath.endsWith('board.json') || fsPath.endsWith('checklist.md'));
		if (isMpiBoardFile) {
			void reloadBoard();
		}
	});

	const configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(KANBAN_ROOT_CONFIG)) {
			scheduleReloadBoard();
		}
	});

	const pollForExternalChanges = setInterval(() => {
		if (!KanbanWebviewPanel.currentPanel) {
			return;
		}

		void (async () => {
			try {
				const store = await resolveStore({ allowPrompt: false, showSetupMessages: false });
				if (!store) {
					return;
				}

				const signature = await store.boardSignature();
				if (lastSeenSignature !== '' && signature === lastSeenSignature) {
					return;
				}

				lastSeenSignature = signature;
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
		checklistWatcher,
		boardWatcher.onDidCreate(async () => {
			await refreshContextKey();
			scheduleReloadBoard();
		}),
		boardWatcher.onDidChange(scheduleReloadBoard),
		boardWatcher.onDidDelete(async () => {
			await refreshContextKey();
			scheduleReloadBoard();
		}),
		taskWatcher.onDidCreate(scheduleReloadBoard),
		taskWatcher.onDidChange(scheduleReloadBoard),
		taskWatcher.onDidDelete(scheduleReloadBoard),
		checklistWatcher.onDidCreate(scheduleReloadBoard),
		checklistWatcher.onDidChange(scheduleReloadBoard),
		checklistWatcher.onDidDelete(scheduleReloadBoard),
		saveListener,
		configurationListener,
		new vscode.Disposable(() => clearInterval(pollForExternalChanges)),
	);

	void resolveStore({ allowPrompt: false, showSetupMessages: false });
}

export function deactivate() {
	void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
}

