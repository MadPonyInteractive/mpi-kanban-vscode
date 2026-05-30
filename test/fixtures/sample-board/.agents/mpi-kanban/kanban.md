# Mpi-Kanban

## BACKLOG

### Plain idea card

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    A minimal card: just a tag and a short description. Use this to check the
    collapsed-card layout and the low-priority badge color.
    ```

### Card with workload and due date

  - tags: [research, vscode]
  - priority: medium
  - workload: Normal
  - dueDate: 2026-06-15
    ```md
    Exercises the workload pill and an upcoming due-date badge.
    ```

## PLANNING

### Card with steps and expanded by default

  - tags: [PLAN]
  - priority: high
  - workload: Hard
  - defaultExpanded: true
  - steps:
      - [x] First step done
      - [x] Second step done
      - [ ] Third step pending
      - [ ] Fourth step pending
    ```md
    Exercises: high-priority badge, Hard workload pill, expanded-on-load,
    the steps progress bar (2/4), and step checkboxes.
    ```

### Overdue card

  - tags: [bug]
  - priority: high
  - dueDate: 2026-01-01
    ```md
    Past due date - exercises the overdue badge styling.
    ```

## IMPLEMENTING

### Extreme workload card

  - tags: [feature]
  - priority: medium
  - workload: Extreme
  - defaultExpanded: true
  - steps:
      - [ ] Not started
    ```md
    Exercises the Extreme workload pill and a 0/1 progress bar.
    ```

## VALIDATING

### Multi-tag card

  - tags: [release, vscode, docs]
  - priority: low
  - workload: Easy
    ```md
    Exercises multiple tag chips wrapping and the Easy workload pill.
    ```

## COMPLETED

### Done card

  - tags: [feature]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
  - steps:
      - [x] All steps complete
      - [x] Shipped
    ```md
    Exercises a fully-completed steps bar (2/2) in the COMPLETED column.
    ```
