# 📝 Article Checklist Manager

A lightweight graphical assistant for checking manuscript readiness. Upload a manuscript and optional figure files, pick the
submission journal, and see the exact changes required to satisfy the journal guidelines—all from the web interface.

## 🎨 What the interface does
- **Upload manuscript (.docx):** Parse sections and word counts directly in the browser.
- **Upload figures (optional):** Attach standalone figure files when they are not embedded in the manuscript.
- **Filter & pick a journal:** Narrow the dropdown with a text filter, then select the journal/article-type entry you want to
  target.
- **See required changes:** The interface lists every change needed (missing sections, word-limit overages, etc.) to meet the
  chosen guideline.

## 🚀 Getting started
1. Clone the repository, start a simple local server (for example `python -m http.server 8000` from the repo root), and open `http://localhost:8000/index.html` in your browser.
2. Click **Upload manuscript (.docx)** and select your file.
3. (Optional) Click **Upload figures** to attach separate figure files.
4. Type in the **Filter journals** box to narrow the dropdown, then choose the target journal entry.
5. Review the **Required changes** list and update your manuscript accordingly.

⚠️ Opening the page directly from `file://` prevents browsers from loading `journal_guidelines.json`. Always launch the app
through a local server (see step 1) so the journal dropdown populates.

Guideline data lives in [`journal_guidelines.json`](journal_guidelines.json). Update it if you need to add or tweak journal
requirements.

## 🛠️ Development notes
- All functionality runs in the browser; there is no CLI flow. Keep refactors GUI-first.
- `.docx` uploads are parsed client-side via [`JSZip`](https://stuk.github.io/jszip/) to extract headings and word counts.
- If you adjust styles or markup, ensure the upload buttons, filter box, dropdown, and change list remain the primary
  controls—these form the core user journey.
