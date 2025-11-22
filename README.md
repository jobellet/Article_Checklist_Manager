# 📝 Article Checklist Manager

A lightweight graphical assistant for checking manuscript readiness. Upload a manuscript and optional figure files, pick the
submission journal, and see the exact changes required to satisfy the journal guidelines—all from the web interface.

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

## 🧭 Async-friendly task prompts for parallel PRs
- **Prompt 1 — Add a Web Worker for manuscript parsing**: "Create `parsers/manuscript.worker.js` to offload `.docx`, `.md`,
  and `.txt` parsing from the main thread and wire `app.js` to call it asynchronously without changing UI markup. Touch only
  the new worker file and the parsing invocation paths in `app.js`."
- **Prompt 2 — Async guideline loading with graceful fallback**: "Refactor `app.js` to load `journal_guidelines.json` via
  `fetch` with a retry/backoff helper in a new `data/guidelines-loader.js` module. Keep existing JSON shape intact and update
  initialization to use the loader without modifying rendering code." (No overlap with Prompt 1 because it introduces a new
  module and adjusts only the guideline bootstrap logic.)
- **Prompt 3 — Parallel figure metadata checks**: "Add `figure-inspector.js` that validates uploaded figures (type/size) in
  parallel using `Promise.allSettled`, and surface results in `figure-status` without altering manuscript parsing paths. Only
  modify `figure-inspector.js` and the figure upload handler wiring in `app.js`."
- **Prompt 4 — Non-blocking export of analysis results**: "Implement an async `exportAnalysis()` utility in
  `export/export-utils.js` that bundles detected sections/word counts into a downloadable JSON, triggered by a new export
  button in `index.html` with styles in `styles.css`. Avoid touching file upload or guideline-loading code." (UI-only overlap
  in `index.html`/`styles.css`, separate from other prompts.)
- **Prompt 5 — Background lint for guideline JSON**: "Introduce `validate_json_async.js` that runs in a Web Worker to validate
  `journal_guidelines.json` against `schemas/guideline-schema.json` without blocking the UI; expose a status banner in
  `index.html` and a toggle in `checklist.js` to enable/disable the background check. Do not alter parsing or figure flows."
