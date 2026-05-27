import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import { MarkdownKanbanParser } from '../markdownParser';

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
});
