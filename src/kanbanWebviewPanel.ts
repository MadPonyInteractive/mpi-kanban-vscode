import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { TaskBoardStore, TaskColumnId } from './taskBoardStore';

export class KanbanWebviewPanel {
    public static currentPanel: KanbanWebviewPanel | undefined;
    public static readonly viewType = 'mpiKanbanPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _board?: any;
    private _store?: TaskBoardStore;

    public static async createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, store: TaskBoardStore) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal(column);
            await KanbanWebviewPanel.currentPanel.loadTaskBoard(store);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            'Mpi-Kanban',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        await KanbanWebviewPanel.currentPanel.loadTaskBoard(store);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri],
        };
        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);
        return KanbanWebviewPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._renderWebview();
        this._setupEventListeners();
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    this.postBoard();
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    private async _handleMessage(message: any) {
        switch (message.type) {
            case 'moveTask':
                await this.moveTask(message.taskId, message.fromColumnId, message.toColumnId, message.newIndex);
                break;
            case 'addTask':
                await this.addTask(message.columnId, message.taskData);
                break;
            case 'deleteTask':
                await this.deleteTask(message.taskId, message.columnId);
                break;
            case 'editTask':
                await this.editTask(message.taskId, message.columnId, message.taskData);
                break;
            case 'toggleChecklistItem':
                await this.toggleChecklistItem(message.taskId, message.itemIndex, message.completed, message.expected);
                break;
            case 'openTaskLink':
                await this.openTaskLink(message.taskId, message.linkKey);
                break;
            case 'openTaskFolder':
                await this.openTaskFolder(message.taskId);
                break;
            case 'toggleTask':
                this.toggleTaskExpansion(message.taskId);
                break;
            case 'refreshBoard':
                await this.refreshBoard();
                break;
            case 'ready':
                this.postBoard();
                break;
        }
    }

    private async refreshBoard() {
        if (!this._store) {
            return;
        }

        await this.loadTaskBoard(this._store);
    }

    public async loadTaskBoard(store: TaskBoardStore) {
        this._store = store;

        try {
            this._board = await store.loadWebviewBoard();
        } catch (error) {
            console.error('Error loading JSON task board:', error);
            vscode.window.showErrorMessage(`Mpi-Kanban board loading error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { title: 'Error Loading Board', workspaceName: store.workspaceFolder.name, columns: [] };
        }

        this.postBoard();
    }

    private _renderWebview() {
        if (!this._panel.webview) return;

        this._panel.webview.html = this._getHtmlForWebview();
    }

    private postBoard(board = this._board || { title: 'Open an MPI Kanban file', columns: [] }) {
        this._panel.webview.postMessage({
            type: 'updateBoard',
            board: board
        });
    }

    private postNotice(kind: 'warning', text: string) {
        this._panel.webview.postMessage({
            type: 'boardNotice',
            kind,
            text,
        });
    }

    private async moveTask(taskId: string, fromColumnId: string, toColumnId: string, newIndex: number) {
        if (!this._store) return;

        this._board = await this._store.moveTask(taskId, fromColumnId as TaskColumnId, toColumnId as TaskColumnId, newIndex);
        this.postBoard();
    }

    private async addTask(columnId: string, taskData: any) {
        if (!this._store) return;

        this._board = await this._store.createTask({
            title: taskData.title,
            description: taskData.description,
        });
        this.postBoard();
    }

    private async deleteTask(taskId: string, columnId: string) {
        if (!this._store) return;

        this._board = await this._store.deleteTask(taskId);
        this.postBoard();
    }

    private async editTask(taskId: string, columnId: string, taskData: any) {
        if (!this._store) return;

        this._board = await this._store.updateTask(taskId, {
            title: taskData.title,
            description: taskData.description,
        });
        this.postBoard();
    }

    private async toggleChecklistItem(taskId: string, itemIndex: number, completed: boolean, expected?: { text?: string; completed?: boolean }) {
        if (!this._store) return;

        try {
            this._board = await this._store.toggleChecklistItem(taskId, itemIndex, completed, expected);
            this.postBoard();
            this.postNotice('warning', 'Checklist updated. Agents treat user checks as progress notes, not validation.');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showWarningMessage(`Mpi-Kanban checklist update skipped: ${message}`);
            this.postNotice('warning', message);
            this.postBoard();
        }
    }

    private async openTaskLink(taskId: string, linkKey: string) {
        if (!this._store) {
            return;
        }

        try {
            await this._store.openTaskLink(taskId, linkKey as any);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open ${taskId} link: ${error}`);
        }
    }

    private async openTaskFolder(taskId: string) {
        if (!this._store) {
            return;
        }

        await this._store.openTaskFolder(taskId);
    }

    private toggleTaskExpansion(taskId: string) {
        this._panel.webview.postMessage({
            type: 'toggleTaskExpansion',
            taskId: taskId
        });
    }

    private _getHtmlForWebview() {
        const packagedHtmlPath = path.join(this._context.extensionPath, 'dist', 'src', 'html', 'webview.html');
        const developmentHtmlPath = path.join(this._context.extensionPath, 'src', 'html', 'webview.html');
        const htmlDir = fs.existsSync(packagedHtmlPath)
            ? path.dirname(packagedHtmlPath)
            : path.dirname(developmentHtmlPath);
        const filePath = vscode.Uri.file(path.join(htmlDir, 'webview.html'));
        let html = fs.readFileSync(filePath.fsPath, 'utf8');

        const baseWebviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.file(htmlDir)
        );

        html = html.replace(/<head>/, `<head><base href="${baseWebviewUri.toString()}/">`);

        return html;
    }

    public dispose() {
        KanbanWebviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }
}
