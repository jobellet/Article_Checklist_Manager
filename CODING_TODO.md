# Coding To-Do List

The following tasks outline sub-projects and Codex-optimised approaches for building out the Article Checklist Manager. Use these entries to co-ordinate work and provide AI with useful context.

| ID  | Sub-project | Goal & Codex-optimised approach | Key artefacts |
|----|-------------|--------------------------------|--------------|
| C-1 | Drive I/O Layer – Stub-First | Generate empty, typed methods (`def save(project: Checklist, path: Path) -> None:`) and pytest skeletons. Commit stubs before prompting Codex to fill bodies, so suggestions align with project style. | `acm/drive.py`, `tests/test_drive.py` |
| C-2 | Widget Kit with Prompt Anchors | For each widget class, start with a triple-quoted docstring that describes behaviour in plain English. Codex uses it as a prompt to write the UI code. | `acm/widgets.py` |
| C-3 | Progress Engine v2 | Write exhaustive docstring examples (doctests) that show expected roll-up maths; ask Codex to “make the examples pass”. | `acm/progress.py`, doctests |
| C-4 | Prompt-Aware Domain Model | Add `# TODO-AI:` comments above empty methods to steer Codex (“…return list of incomplete leaf nodes”). Keeps prompts close to code. | `acm/domain.py` |
| C-5 | Colab Helper (`setup()`) | Draft narrative comments (“Mount Drive, pip install from TestPyPI, then open dashboard”) so Codex can stitch boilerplate. | `acm/colab.py` |
| C-6 | Codex-Ready CI | CI runs `pytest -q` and uploads coverage HTML to GitHub Pages; Codex can reference coverage gaps in chat. | `.github/workflows/ci.yml` |
| C-7 | Prompt Library | Central file of reusable prompt snippets (`prompts.yaml`) so devs can call Codex consistently (“Generate Pydantic model from YAML schema…”). | `acm/prompts.yaml` |
| C-8 | Docstring Linter | Pre-commit hook that enforces Google-style docstrings & examples—critical for Codex context quality. | `.pre-commit-config.yaml` |

## Milestones & unlocked tasks (Codex-aware)

Each milestone merges to `main`; tasks listed beneath assume that code is present, giving Codex richer context for the next phase.

- **M0 — Codex-Bootstrapped Skeleton**
  - All core modules exist as typed stubs + failing tests.
  - **Unlocked →** Codex bulk-fill pass: invoke `# TODO-AI: implement` across repo.
  - `.copilot.json` with repository-wide rules.

- **M1 — Drive I/O & Registry**
  - `DriveProjectManager` passes tests and CI.
  - **Unlocked →** Idempotent save/merge helpers. Secrets handling guidelines.

- **M2 — Interactive Checklist Editor**
  - `ipywidgets` UI renders tasks; on-change signals recompute progress.
  - **Unlocked →** Drag-and-drop via `@widgets.register`, bulk import dialog.

- **M3 — Round-Trip Sync**
  - Save/load round-trips between Drive YAML and widget tree.
  - **Unlocked →** Autosave every 30s via `events.on_interval`. Snapshot diff viewer.

- **M4 — Colab Tutorial v2**
  - End-to-end notebook passes CI via papermill.
  - **Unlocked →** “Run in Colab” badge in README. Spanish & French docs.

- **M5 — 1-Click Badge Release**
  - v0.5 on PyPI; Colab badge opens interactive notebook.
  - **Unlocked →** Blog post on GitHub Blog showcasing Codex workflow.

## Codex-specific best-practice checklist

- [ ] Write failing tests first; Codex generates code that makes them pass.
- [ ] Keep functions < 50 LOC; large blocks reduce suggestion quality.
- [ ] Use Google-style docstrings with examples so Codex copies patterns.
- [ ] Preface empty stubs with `# TODO-AI:` to create focused prompts.
- [ ] Commit early, commit often; Copilot sees only tracked files.
- [ ] Review every AI diff; don’t assume correctness.
- [ ] Regenerate until satisfied—Copilot offers alternative completions via keyboard shortcuts.
- [ ] Refactor relentlessly; AI completes code faster than humans read spaghetti.

## Next actions

1. Create issues for C-1 … C-8 and label them **codex-ready**.
2. Merge milestone M0 stubs so Codex gains repo-wide type & docstring context.
3. Encourage devs to pair-program with Codex: one writes high-level tests, the other prompts AI for implementations, cutting cycle time dramatically.

