import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

const KANBAN_RELATIVE_PATH = '.claude/mpi-kanban/kanban.md';
const OPEN_COMMAND = 'mpi-kanban.openKanban';
const CONTEXT_KEY = 'mpiKanbanActive';

function getCandidateKanbanUris(): vscode.Uri[] {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return [];
	}

	return folders.map(folder => vscode.Uri.joinPath(folder.uri, ...KANBAN_RELATIVE_PATH.split('/')));
}

async function findWorkspaceKanbanUri(requireExists = false): Promise<vscode.Uri | undefined> {
	const candidates = getCandidateKanbanUris();

	for (const uri of candidates) {
		try {
			await vscode.workspace.fs.stat(uri);
			return uri;
		} catch {
			// Try the next workspace folder.
		}
	}

	return requireExists ? undefined : candidates[0];
}

function isWorkspaceKanbanUri(uri: vscode.Uri): boolean {
	return getCandidateKanbanUris().some(candidate => uri.toString() === candidate.toString());
}

async function openWorkspaceKanban(context: vscode.ExtensionContext, uri?: vscode.Uri) {
	const targetUri = uri ?? await findWorkspaceKanbanUri();

	if (!targetUri) {
		vscode.window.showErrorMessage('Open a workspace before opening Mpi-Kanban.');
		return;
	}

	if (!targetUri.fsPath.endsWith(KANBAN_RELATIVE_PATH.replace(/\//g, '\\')) && !targetUri.fsPath.endsWith(KANBAN_RELATIVE_PATH)) {
		vscode.window.showErrorMessage(`Mpi-Kanban only opens ${KANBAN_RELATIVE_PATH}.`);
		return;
	}

	try {
		const document = await vscode.workspace.openTextDocument(targetUri);
		KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);
		await vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);
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
				const kanbanUri = await findWorkspaceKanbanUri(true);

				if (!kanbanUri) {
					await vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
					return;
				}

				const document = await vscode.workspace.openTextDocument(kanbanUri);
				panel.loadMarkdownFile(document);
				await vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);
			}
		});
	}

	const openKanbanCommand = vscode.commands.registerCommand(OPEN_COMMAND, async (uri?: vscode.Uri) => {
		await openWorkspaceKanban(context, uri);
	});

	const kanbanWatcher = vscode.workspace.createFileSystemWatcher(`**/${KANBAN_RELATIVE_PATH}`);

	const reloadKanban = async (uri: vscode.Uri) => {
		if (!isWorkspaceKanbanUri(uri)) {
			return;
		}

		await vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);

		if (!KanbanWebviewPanel.currentPanel) {
			return;
		}

		try {
			const stat = await vscode.workspace.fs.stat(uri);
			lastSeenMtime = stat.mtime;
		} catch {
			// The file may have been deleted between the watcher event and reload.
		}

		const [document, content] = await Promise.all([
			vscode.workspace.openTextDocument(uri),
			vscode.workspace.fs.readFile(uri)
		]);
		KanbanWebviewPanel.currentPanel.loadMarkdownContent(Buffer.from(content).toString('utf8'), document);
	};

	const scheduleReloadKanban = (uri: vscode.Uri) => {
		if (reloadTimer) {
			clearTimeout(reloadTimer);
		}

		reloadTimer = setTimeout(() => {
			void reloadKanban(uri);
		}, 100);
	};

	const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
		if (isWorkspaceKanbanUri(document.uri)) {
			void reloadKanban(document.uri);
		}
	});

	const pollForExternalChanges = setInterval(() => {
		if (!KanbanWebviewPanel.currentPanel) {
			return;
		}

		void (async () => {
			try {
				const uri = await findWorkspaceKanbanUri(true);
				if (!uri) {
					return;
				}

				const stat = await vscode.workspace.fs.stat(uri);
				if (lastSeenMtime !== 0 && stat.mtime === lastSeenMtime) {
					return;
				}

				lastSeenMtime = stat.mtime;
				scheduleReloadKanban(uri);
			} catch {
				// Ignore transient file access errors during external writes.
			}
		})();
	}, 2000);

	context.subscriptions.push(
		openKanbanCommand,
		kanbanWatcher,
		kanbanWatcher.onDidCreate(scheduleReloadKanban),
		kanbanWatcher.onDidChange(scheduleReloadKanban),
		kanbanWatcher.onDidDelete(async () => {
			await vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
		}),
		saveListener,
		new vscode.Disposable(() => clearInterval(pollForExternalChanges)),
	);

	if (getCandidateKanbanUris().length > 0) {
		void vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);
	}
}

export function deactivate() {
	void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
}
