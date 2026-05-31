const vscode = acquireVsCodeApi()

let currentBoard = null
let selectedTaskId = null
let editingTask = null
let dragState = null
let noticeTimeout = null

window.addEventListener('message', event => {
  const message = event.data
  if (message.type === 'updateBoard') {
    currentBoard = message.board
    if (!selectedTaskId) {
      selectedTaskId = firstTaskId(currentBoard)
    }
    renderBoard()
  } else if (message.type === 'boardNotice') {
    showBoardNotice(message.kind, message.text)
  }
})

document.addEventListener('DOMContentLoaded', () => {
  document.body.innerHTML = `
    <main class="task-board-shell">
      <header class="task-board-toolbar">
        <div>
          <h1>Mpi-Kanban</h1>
          <p id="workspace-label"></p>
        </div>
        <button class="primary-button" id="add-task-button" type="button">Add Task</button>
      </header>
      <div class="board-notice" id="board-notice" role="status" hidden></div>
      <section class="task-board-layout">
        <div class="kanban-board" id="kanban-board"></div>
        <aside class="task-detail-panel" id="task-detail-panel"></aside>
      </section>
    </main>
    <div class="modal" id="task-modal">
      <form class="modal-content task-form" id="task-form">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Add Task</h2>
          <button class="close-btn" id="close-task-modal" type="button">x</button>
        </div>
        <label class="form-label" for="task-title">Title</label>
        <input class="form-input" id="task-title" required>
        <label class="form-label" for="task-description">Description</label>
        <textarea class="form-textarea" id="task-description" rows="5"></textarea>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-task-modal" type="button">Cancel</button>
          <button class="btn btn-primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  `

  document.getElementById('add-task-button').addEventListener('click', () => openTaskModal())
  document.getElementById('close-task-modal').addEventListener('click', closeTaskModal)
  document.getElementById('cancel-task-modal').addEventListener('click', closeTaskModal)
  document.getElementById('task-modal').addEventListener('click', event => {
    if (event.target.id === 'task-modal') {
      closeTaskModal()
    }
  })
  document.getElementById('task-form').addEventListener('submit', submitTaskForm)
  vscode.postMessage({ type: 'ready' })
})

function renderBoard () {
  if (!currentBoard) return

  const workspaceLabel = document.getElementById('workspace-label')
  workspaceLabel.textContent = currentBoard.workspaceName || ''

  if (selectedTaskId && !findTask(selectedTaskId)) {
    selectedTaskId = firstTaskId(currentBoard)
  }

  const boardElement = document.getElementById('kanban-board')
  boardElement.innerHTML = ''
  currentBoard.columns.forEach(column => {
    boardElement.appendChild(createColumn(column))
  })

  renderDetailPanel()
}

function createColumn (column) {
  const columnElement = document.createElement('section')
  columnElement.className = 'kanban-column'
  columnElement.dataset.columnId = column.id
  columnElement.innerHTML = `
    <div class="column-header">
      <h2 class="column-title">${escapeHtml(column.title)}</h2>
      <span class="task-count">${column.tasks.length}</span>
    </div>
    <div class="tasks-container"></div>
  `

  const tasksContainer = columnElement.querySelector('.tasks-container')
  column.tasks.forEach(task => tasksContainer.appendChild(createTaskCard(task, column.id)))
  setupColumnDrop(columnElement, column.id)
  return columnElement
}

function createTaskCard (task, columnId) {
  const card = document.createElement('article')
  const maturityClass = task.maturity ? `maturity-${task.maturity}` : ''
  const attentionClass = task.attention?.state === 'required' ? 'attention-required' : ''
  card.className = `task-item ${task.id === selectedTaskId ? 'selected' : ''} ${maturityClass} ${attentionClass}`.trim()
  card.draggable = true
  card.dataset.taskId = task.id
  card.dataset.columnId = columnId
  card.innerHTML = `
    <div class="task-card-topline">
      <span class="task-id">${escapeHtml(task.id)}</span>
      ${task.attention?.state === 'required' ? '<span class="attention-dot" title="Attention required"></span>' : ''}
    </div>
    <h3 class="task-title">${escapeHtml(task.title)}</h3>
    ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
    <div class="task-badges">
      ${task.maturity ? `<span>${escapeHtml(task.maturity)}</span>` : ''}
      ${task.status ? `<span>${escapeHtml(task.status)}</span>` : ''}
    </div>
    ${columnId === 'doing' ? createChecklistPreview(task.checklist) : ''}
    <div class="task-actions">
      <button class="action-btn" data-action="edit" type="button">Edit</button>
      <button class="action-btn delete" data-action="delete" type="button">Delete</button>
    </div>
  `

  card.addEventListener('click', event => {
    if (isInteractiveCardTarget(event.target)) return
    selectedTaskId = task.id
    renderBoard()
  })
  card.addEventListener('dblclick', event => {
    if (isInteractiveCardTarget(event.target)) return
    selectedTaskId = task.id
    renderDetailPanel()
  })
  card.addEventListener('dragstart', event => {
    if (isInteractiveCardTarget(event.target)) {
      event.preventDefault()
      return
    }
    dragState = { taskId: task.id, fromColumnId: columnId }
    event.dataTransfer.setData('text/plain', task.id)
    event.dataTransfer.setData('application/column-id', columnId)
    event.dataTransfer.setData('application/json', JSON.stringify(dragState))
    event.dataTransfer.effectAllowed = 'move'
    card.classList.add('dragging')
    document.body.classList.add('is-dragging-task')
  })
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging')
    clearDragState()
  })
  card.querySelector('[data-action="edit"]').addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    openTaskModal(task)
  })
  card.querySelector('[data-action="delete"]').addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    deleteTask(task.id, columnId)
  })
  card.querySelectorAll('.checklist-toggle').forEach(toggle => {
    toggle.addEventListener('change', event => {
      event.preventDefault()
      event.stopPropagation()
      selectedTaskId = task.id
      const itemIndex = Number(toggle.dataset.itemIndex)
      const previousCompleted = toggle.dataset.completed === 'true'
      toggle.disabled = true
      if (task.activeSessionTitle) {
        showBoardNotice('warning', 'Active work is attached to this task. The checklist will update, but the agent may need to reconcile it.')
      }
      vscode.postMessage({
        type: 'toggleChecklistItem',
        taskId: task.id,
        itemIndex,
        completed: toggle.checked,
        expected: {
          text: toggle.dataset.itemText,
          completed: previousCompleted,
        },
      })
    })
  })
  return card
}

function createChecklistPreview (items = []) {
  if (items.length === 0) return ''
  const visible = items.slice(0, 5).map((item, index) => `
    <li class="${item.completed ? 'completed' : ''}">
      <input
        class="checklist-toggle"
        type="checkbox"
        data-item-index="${index}"
        data-item-text="${escapeHtml(item.text)}"
        data-completed="${item.completed ? 'true' : 'false'}"
        title="Toggle checklist item"
        ${item.completed ? 'checked' : ''}
      >
      <span>${escapeHtml(item.text)}</span>
    </li>
  `).join('')
  return `<ul class="checklist-preview">${visible}</ul>`
}

function isInteractiveCardTarget (target) {
  return Boolean(target.closest('button, input, label, textarea, select, a'))
}

function showBoardNotice (kind = 'warning', text = '') {
  const notice = document.getElementById('board-notice')
  if (!notice || !text) return
  notice.className = `board-notice ${kind}`
  notice.textContent = text
  notice.hidden = false
  window.clearTimeout(noticeTimeout)
  noticeTimeout = window.setTimeout(() => {
    notice.hidden = true
  }, 4200)
}

function setupColumnDrop (columnElement, columnId) {
  const tasksContainer = columnElement.querySelector('.tasks-container')

  columnElement.addEventListener('dragenter', event => {
    if (!getDragPayload(event)) return
    event.preventDefault()
    columnElement.classList.add('drag-over')
  })

  columnElement.addEventListener('dragover', event => {
    if (!getDragPayload(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    columnElement.classList.add('drag-over')
  })

  columnElement.addEventListener('dragleave', event => {
    if (!columnElement.contains(event.relatedTarget)) {
      columnElement.classList.remove('drag-over')
    }
  })

  columnElement.addEventListener('drop', event => {
    event.preventDefault()
    event.stopPropagation()
    columnElement.classList.remove('drag-over')

    const payload = getDragPayload(event)
    if (!payload?.taskId || !payload?.fromColumnId) {
      clearDragState()
      return
    }

    selectedTaskId = payload.taskId
    vscode.postMessage({
      type: 'moveTask',
      taskId: payload.taskId,
      fromColumnId: payload.fromColumnId,
      toColumnId: columnId,
      newIndex: calculateDropIndex(tasksContainer, event.clientY, payload.taskId),
    })
    clearDragState()
  })
}

document.addEventListener('drop', clearDragState)
document.addEventListener('dragend', clearDragState)

function getDragPayload (event) {
  if (dragState) return dragState

  try {
    const jsonPayload = event.dataTransfer?.getData('application/json')
    if (jsonPayload) {
      return JSON.parse(jsonPayload)
    }
  } catch {
    // Fall back to individual transfer fields below.
  }

  const taskId = event.dataTransfer?.getData('text/plain')
  const fromColumnId = event.dataTransfer?.getData('application/column-id')
  return taskId && fromColumnId ? { taskId, fromColumnId } : null
}

function clearDragState () {
  dragState = null
  document.body.classList.remove('is-dragging-task')
  document.querySelectorAll('.drag-over, .dragging').forEach(element => {
    element.classList.remove('drag-over', 'dragging')
  })
}

function calculateDropIndex (container, clientY, draggedTaskId) {
  const tasks = Array.from(container.querySelectorAll('.task-item:not(.dragging)'))
  for (let index = 0; index < tasks.length; index++) {
    const rect = tasks[index].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) {
      return index
    }
  }
  return Array.from(container.children).filter(child => child.dataset.taskId !== draggedTaskId).length
}

function renderDetailPanel () {
  const panel = document.getElementById('task-detail-panel')
  const task = findTask(selectedTaskId)
  if (!task) {
    panel.className = 'task-detail-panel'
    panel.innerHTML = '<p class="empty-detail">Select a task.</p>'
    return
  }

  panel.className = `task-detail-panel ${task.maturity ? `detail-maturity-${safeClassName(task.maturity)}` : ''}`.trim()

  const primaryLinks = createDetailLinks(task, ['brief', 'plan', 'checklist', 'validation'])
  const artifactLinks = createDetailLinks(task, ['events', 'files', 'handoffs', 'research'])
  const stateBadges = [
    task.maturity ? `<span class="detail-state-pill">${escapeHtml(task.maturity)}</span>` : '',
    task.status ? `<span class="detail-state-pill muted">${escapeHtml(task.status)}</span>` : '',
  ].join('')

  panel.innerHTML = `
    <div class="detail-heading">
      <div class="detail-kicker">
        <span class="task-id">${escapeHtml(task.id)}</span>
        <div class="detail-state-pills">${stateBadges}</div>
      </div>
      <h2>${escapeHtml(task.title)}</h2>
    </div>
    ${task.description ? `<p class="detail-description">${escapeHtml(task.description)}</p>` : ''}
    ${task.attention?.state === 'required' ? `<div class="attention-callout">${escapeHtml(task.attention.reason || 'Attention required')}</div>` : ''}
    ${task.activeSessionTitle ? `<div class="active-session">${escapeHtml(task.activeSessionTitle)}</div>` : ''}
    <section class="detail-section">
      <h3>Task Workspace</h3>
      <div class="detail-links primary-links">${primaryLinks || '<p class="empty-detail">No workspace links.</p>'}</div>
    </section>
    <details class="artifact-disclosure">
      <summary>Artifacts</summary>
      <div class="detail-links artifact-links">
        ${artifactLinks}
        <button class="link-button" id="open-task-folder" type="button">Task Folder<span>Reveal in file system</span></button>
      </div>
    </details>
  `

  panel.querySelectorAll('[data-link]').forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({ type: 'openTaskLink', taskId: task.id, linkKey: button.dataset.link })
    })
  })

  panel.querySelector('#open-task-folder')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'openTaskFolder', taskId: task.id })
  })
}

function createDetailLinks (task, keys) {
  return keys
    .filter(key => Boolean(task.links?.[key]))
    .map(key => {
      const value = task.links[key]
      return `<button class="link-button" data-link="${escapeHtml(key)}" type="button">${detailLinkLabel(key)}<span>${detailLinkHint(task, key, value)}</span></button>`
    })
    .join('')
}

function detailLinkLabel (key) {
  const labels = {
    brief: 'Brief',
    plan: 'Plan',
    checklist: 'Checklist',
    validation: 'Validation',
    events: 'Events',
    files: 'Files',
    handoffs: 'Handoffs',
    research: 'Research',
  }
  return labels[key] || key
}

function detailLinkHint (task, key, value) {
  if (key === 'checklist') {
    const total = task.checklist?.length || 0
    if (total === 0) return 'No checklist items'
    const completed = task.checklist.filter(item => item.completed).length
    return `${completed}/${total} done`
  }

  return escapeHtml(value)
}

function safeClassName (value) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

function openTaskModal (task = null) {
  editingTask = task
  document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'Add Task'
  document.getElementById('task-title').value = task?.title || ''
  document.getElementById('task-description').value = task?.description || ''
  document.getElementById('task-modal').style.display = 'block'
  document.getElementById('task-title').focus()
}

function closeTaskModal () {
  editingTask = null
  document.getElementById('task-modal').style.display = 'none'
}

function submitTaskForm (event) {
  event.preventDefault()
  const title = document.getElementById('task-title').value.trim()
  const description = document.getElementById('task-description').value.trim()
  if (!title) return

  if (editingTask) {
    vscode.postMessage({
      type: 'editTask',
      taskId: editingTask.id,
      columnId: editingTask.column,
      taskData: { title, description },
    })
  } else {
    vscode.postMessage({
      type: 'addTask',
      columnId: 'todo',
      taskData: { title, description },
    })
  }
  closeTaskModal()
}

function deleteTask (taskId, columnId) {
  if (selectedTaskId === taskId) {
    selectedTaskId = null
  }
  vscode.postMessage({ type: 'deleteTask', taskId, columnId })
}

function findTask (taskId) {
  if (!currentBoard || !taskId) return null
  for (const column of currentBoard.columns) {
    const task = column.tasks.find(candidate => candidate.id === taskId)
    if (task) return task
  }
  return null
}

function firstTaskId (board) {
  if (!board) return null
  for (const column of board.columns) {
    if (column.tasks[0]) return column.tasks[0].id
  }
  return null
}

function escapeHtml (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
