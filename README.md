# 📝 Article Checklist Manager

A lightweight graphical assistant for checking manuscript readiness. Upload a manuscript and optional figure files, pick the
submission journal, and see the exact changes required to satisfy the journal guidelines—all from the web interface.

🌐 Live site: https://jobellet.github.io/Article_Checklist_Manager/

## 🐍 Python GUI installation
1. Create and activate a Python 3.9+ virtual environment.
2. Install dependencies: `pip install .` (from the repository root).
3. Launch the Streamlit interface: `python -m acm.cli gui`.
4. Open the displayed local URL in your browser and upload your manuscript/figures to begin.

## 🎨 What the interface does
- **Upload manuscript (.docx, .txt, .md):** Parse sections and word counts directly in the browser.
- **Upload figures (optional):** Attach standalone figure files when they are not embedded in the manuscript. The upload is
  optional and will never block analysis.
- **Filter & pick a journal:** Narrow the dropdown with a text filter, then select the journal/article-type entry you want to
  target.
- **See required changes:** The interface lists every change needed (missing sections, word-limit overages, etc.) to meet the
  chosen guideline.
- **Figure awareness:** The app counts sequential "Figure n" references inside the manuscript so you can track how many
  figures are mentioned even if you skip uploads.

## 🚀 Getting started
1. Clone the repository and open `index.html` in your browser (no backend required).
2. Click **Upload manuscript (.docx, .txt, .md)** and select your file.
3. (Optional) Click **Upload figures** to attach separate figure files.
4. Type in the **Filter journals** box to narrow the dropdown, then choose the target journal entry.
5. Review the **Required changes** list and update your manuscript accordingly.

Guideline data lives in [`journal_guidelines.json`](journal_guidelines.json). Update it if you need to add or tweak journal
requirements.

## 🛠️ Development notes
- All functionality runs in the browser; there is no CLI flow. Keep refactors GUI-first.
- `.docx` uploads are parsed client-side via [`JSZip`](https://stuk.github.io/jszip/) to extract headings and word counts.
- If you adjust styles or markup, ensure the upload buttons, filter box, dropdown, and change list remain the primary
  controls—these form the core user journey.
- A data-only `TaskStore` (see `src/utils/task-store.js`) now mirrors the unified task model requested in the scheduler
  roadmap. It supports routine creation/edit/delete, habit-driven task ingestion, shared duration learning, dependency-
  aware rescheduling, and focus-mode completion plumbing. It now powers lightweight Today/Planner/Achievement/Reward
  previews in the UI without blocking manuscript features.

## 📱 Responsiveness and navigation
- The hero actions stack vertically on narrow screens while keeping large tap targets for the upload controls.
- Form grids collapse to single-column layouts under 720px wide to avoid horizontal scrolling.
- Buttons adopt a minimum hit area of 44px to remain mobile-friendly.
- Planner/Today/Focus refinements are modeled in the `TaskStore` layer; when wired to the UI ensure mobile tap targets
  and stacked layouts match the existing patterns.

## ✅ Manual test cases
Use these quick checks after changes:
1. **Upload flow:** Open `index.html`, upload a `.docx` file, and confirm manuscript status updates and sections render.
2. **Figure uploads:** Attach a few images/PDFs and verify the figure status reflects the upload.
3. **Journal filtering:** Type in the filter box to narrow the dropdown, pick an entry, and confirm the change list updates.
4. **Markdown export:** Click **Export checklist as Markdown** once a journal is selected and confirm download begins.
5. **Routine → Task store mapping (UI):** Click **Sync sample routine** in the Today/Planner panel, verify routine steps
   appear in both lists, toggle the button again to see routine edits propagate, and remove the routine to ensure tasks are
   marked inactive but history remains in achievements/rewards.
6. **Unified Task Editor:** Open the editor from a Today/Planner card, edit duration or importance, save, and confirm the
   change reflects across all lists and the planner reschedule message updates appropriately.
7. **Planner → Focus path:** From the Planner, click **Start focus** on a task and verify it marks complete, updates the
   learned duration, and updates the ledger/achievement totals.
8. **Habit → achievements:** Click **Ingest habit** to create a Habit-derived completion and verify Achievements updates
   the Habit: <name> category totals and that Rewards counts the completion as a spent/bonus event.
9. **Manual habit defaults:** In a Node REPL call
   `store.ingestHabitCompletion({ name: 'Stretch', user: 'me' })` (or rely on `node --test tests/task-store.test.js`) to
   see a `Habit: Stretch` task marked complete with default duration/importance, ready to feed achievements/ledgers.
10. **Focus completion plumbing (data-only):** Use `store.completeFocusSession(taskId, { actualDurationMinutes: 25 })` to
    ensure focus-driven completions update learning and task state in the same way as Today/Planner completions.
11. **Mobile layout:** Resize the viewport below 480px and ensure upload controls, Today/Planner/Achievement cards, and
    buttons stack without horizontal scroll while remaining tap-friendly.

## 🔭 Future alignment
The incoming feature list references a richer task scheduler (routines, multi-user focus mode, ledgers, etc.). The
`TaskStore` implements the core data semantics—routine steps become tasks scoped to a user, completions update shared
duration profiles, habits are ingested with consistent naming/defaults, focus-mode completions reuse the same plumbing, and
reschedule attempts can block on dependencies. UI wiring (Today View, Day Planner, Family overview, unified editor) should
preserve the current journal-fit workflow while layering these flows on top.

## 🧭 Async-friendly task prompts for parallel PRs
- **Prompt 1 — Progress-aware manuscript worker**: "Extend `parsers/manuscript.worker.js` to emit incremental progress events
  while parsing `.docx`, `.md`, and `.txt` files and support cancellation messages. Update only the existing worker and the
  manuscript parsing wiring in `app.js` to display progress in `manuscript-status` without changing HTML structure."
- **Prompt 2 — Cached guideline bootstrap**: "Add `data/guidelines-cache.js` that reads/writes `localStorage` with a simple
  version key, and have `data/guidelines-loader.js` consult the cache before fetching `journal_guidelines.json`. Include
  coverage in `tests/guidelines-loader.test.js` for cache hit/miss/expiry behavior. No UI changes." (No overlap with Prompt 1
  because it is isolated to the data layer.)
- **Prompt 3 — Figure validation queue**: "Create `figures/figure-inspector.js` that validates uploaded figures (MIME/size)
  using a concurrency-limited queue and `Promise.allSettled`, and wire `app.js` to show per-file results in `figure-status`
  without altering manuscript parsing or guideline loading." (Touches only the new inspector module and the figure upload
  handler.)
- **Prompt 4 — Async export of analysis summary**: "Implement `export/export-utils.js` with a `buildAnalysisExport()` helper
  that assembles current sections, word counts, and selected guideline details into a downloadable JSON Blob. Add an export
  button in `index.html`, light styles in `styles.css`, and an `app.js` click handler that calls the helper without modifying
  upload or filtering behavior." (UI overlap limited to `index.html`/`styles.css`.)
- **Prompt 5 — Background guideline schema lint**: "Introduce `validate/validate-guidelines.worker.js` that checks
  `journal_guidelines.json` against `schemas/guideline-schema.json` off the main thread and reports status via
  `validate/validation-status.js`. Surface the status banner hookup in `app.js` only; do not touch figure/manuscript flows."
