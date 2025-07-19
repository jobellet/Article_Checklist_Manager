1  |  Subtasks that can be coded asynchronously ♻️

These items have few or no cross-dependencies, so multiple contributors can tackle them in parallel right away.
•YAML Schema Drafting
Define a recursive TaskNode schema that supports infinite nesting, completion flags, and per-node percentage override.
•Domain Model (Python)
Implement ArticleProject, TaskNode, and Checklist classes with CRUD methods and JSON/YAML (de)serialisation.
•CLI Argument Parser
Set up typer/argparse scaffolding; stubs for commands init, status, check, uncheck, rename, delete.
•Progress Calculator
Pure-function module that rolls up percentages from leaf nodes to the root.
•ASCII/Unicode Progress-Bar Renderer
Renders hierarchical bars with indentation—works independently of the storage layer.
•Unit-Test Harness
Configure pytest plus coverage; write tests for schema validation, progress math, and CLI edge-cases.
•Continuous-Integration Pipeline
GitHub Actions: lint, type-check, test matrix (Linux/macOS/Windows, Py3.9-3.12).
•Packaging Skeleton
pyproject.toml, version bump script, entry-point spec.
•Documentation Boilerplate
MkDocs (or Sphinx) site with auto-generated API docs.

Because these modules interact only via public interfaces (e.g. TaskNode methods), teams can merge them in any order.

⸻

2  |  Milestones and the tasks they unlock 📅

Rule of thumb: tasks listed after a milestone assume the milestone’s artifacts are merged to main.

M0 — Project Bootstrap

Git repository initialised, CI pipeline green, basic devcontainer or Poetry environment committed.

Unlocked tasks
•Release automation (bumpver, GitHub Release notes generator)
•Pre-commit hooks (black, ruff, mypy)

⸻

M1 — CLI Core (v0.1 tag)

Domain model + YAML persistence + basic commands operational; acm init, status, check, uncheck functional.

Unlocked tasks
•Multi-Project Registry (~/.acm/projects.json)
•Interactive acm shell REPL
•Coloured output & progress-bar theming
•Bash/Zsh/Fish completion scripts

⸻

M2 — Multi-Project & Config Support

Global config, project registry, user preferences implemented.

Unlocked tasks
•Cloud storage back-ends (GitHub Gist, S3)
•Team-shared config file with role-based permissions
•User-level analytics opt-in (usage ping)

⸻

M3 — Journal Template System

Template loader, validator engine, and first built-in templates (Cell Press, Nature, Science) shipped.

Unlocked tasks
•Community template marketplace (template repo index)
•CLI command acm template pull <url>
•Template test-suite runner (CI for external template PRs)

⸻

M4 — Import/Export & Reporting

Markdown/PDF export working; JSON report generator for dashboards.

Unlocked tasks
•Weekly progress email digests (acm cron send-digest)
•Custom export plugins (LaTeX, Word DOCX)
•Shareable public progress badge (shields.io style)

⸻

M5 — Desktop GUI Alpha

Electron/Tauri app opens projects, renders tree view with live progress.

Unlocked tasks
•Drag-and-drop re-ordering
•Inline percentage sliders
•Dark-mode & high-contrast themes
•Auto-update mechanism (Electron) or AppImage build (Tauri/Linux)

⸻

M6 — Sync & Collaboration

Git integration (commit on save), GitHub Issues mirror, WebSocket real-time-sync prototype live.

Unlocked tasks
•Conflict-resolution UI
•Offline-first caching & deferred pushes
•Activity feed / audit log
•Role-based access control (viewer vs editor)

⸻

M7 — Extensibility & Plugin API

Dynamic plug-in loader, entry-point spec, sample “word-count” plugin.

Unlocked tasks
•Plugin marketplace UI in the GUI
•Sandbox/permission model for third-party plugins
•CLI command acm doctor to vet plugin health

⸻

M8 — Export to Submission Portals

Scriptable exporters for Editorial Manager, ScholarOne, eLife Lens.

Unlocked tasks
•Headless browser tests against staging portals
•One-click “prepare package” wizard
•Dry-run linter for common portal errors

⸻

M9 — 1.0 Stable Release

Feature-complete, localisation (EN/FR/ES) done, ORCID & DOI autofill, docs polished.

Unlocked tasks
•Homebrew / Chocolatey / Snapcraft packages
•Enterprise mode (on-prem licence check)
•Long-term support branch & bug-backport policy

⸻

M10 — Post-1.0 Continuous Improvement

Ongoing, runs in parallel once 1.0 is out.

Tasks
•Performance profiling & optimisation
•Accessibility audits (WCAG 2.2)
•Additional language packs
•Quarterly UX review & design refresh

⸻

How to use this list
1.Assign developers to independent subtasks within the current milestone to maximise parallel throughput.
2.Gate work on any task under future milestones until the current milestone is merged—this keeps PRs smaller and avoids re-work.
3.Promote ready-for-review tasks immediately; long-running items (e.g. GUI theming) can live in feature branches that track main nightly.

