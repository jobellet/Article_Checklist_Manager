📝 Article Checklist Manager

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/jobellet/Article_Checklist_Manager/blob/main/Colab_Tutorial.ipynb)

An open-source tool that helps research teams track, from the top-level section down to the tiniest to-do, how close a manuscript is to being submission-ready.

⸻

🚀 Project Goal
	1.	Create a dedicated project for each manuscript (acm init --project-name <ProjectName>).
	2.	Generate a hierarchical checklist that you can break into any number of sections and nested sub-tasks (e.g. Title & Abstract → Abstract quality → Word count check).
	3.	Visualize progress with percentage bars at every level: per sub-task, per parent section, and overall.
	4.	Adapt the checklist to journal-specific requirements (e.g. Cell Press STAR Methods, Nature Reporting Summary, data availability statements).

⸻

🧩 Key Features (MVP)
	•	Initialize a new article project with acm init --project-name <ProjectName>
	•	Generate a starter YAML checklist template that you can edit freely
	•	Update the status or percentage of any task: acm check "Methods/STAR Methods/Key resources table" --done or --percent 60
	•	Display a CLI dashboard that aggregates completion across the hierarchy
	•	Export the checklist to Markdown or PDF for internal review

⸻

🗺️ Roadmap

0.1 — CLI Prototype
        •       Flexible YAML schema supporting unlimited nesting depth
        •       Multi-project management
        •       Core commands: init, status, check, uncheck, rename, delete
        •       ASCII progress-bar rendering at each nested level

0.2 — Journal Templates
        •       Built-in templates for Cell Press (STAR Methods), Nature, Science
        •       Guidelines sourced from `journal_guidelines.json`
        •       Automatic validation of mandatory checklist items

0.3 — GUI Foundations (current)
        •       In-app upload for manuscripts (.docx) plus JPEG/PNG/SVG/PDF figures
        •       Automatic asynchronous routines: section word counts, figure resolution checks, font-format hints
        •       Streamlit-based launcher with one-click `acm gui`
        •       Progress panels for manuscript and figure quality feedback

0.4 — GUI Refinements
        •       Drag-and-drop to re-order and nest tasks
        •       Rich checklist editing with autosave and inline guideline tips
        •       Upload history with run logs for automated checks
        •       Configurable thresholds for DPI, font usage, and section targets

0.5 — Collaboration
        •       Git & GitHub Issues sync
        •       Real-time collaboration (WebSocket)
        •       Comment threads per task and per guideline warning

1.0 — Stable Release
        •       ORCID & DOI integration for auto-fill
        •       Export scripts for major submission portals
        •       Internationalization (EN, FR, ES)
        •       Desktop builds (Electron/Tauri) for offline-first workflows
⸻

🔧 Quick Install (CLI Prototype)

Clone the repository and install it locally until the PyPI release is available:

```bash
git clone https://github.com/jobellet/Article_Checklist_Manager.git
cd Article_Checklist_Manager
pip install -e .
acm init --project-name MyGreatPaper
acm status
acm check "Results/Fig 3/Statistical review" --percent 75
```

🖥️ GUI Preview (Streamlit)

```bash
pip install -e .
acm gui
```

Upload a `.docx` manuscript and optional JPEG/PNG/SVG/PDF figures to trigger asynchronous checks for section word counts, figure resolution, and font metadata hints.


⸻

📝 Sample Checklist (YAML)

```yaml
name: MyGreatPaper
checklist:
  tasks:
    - item: Title and Abstract
      subtasks:
        - item: Title finalized
          done: false
        - item: Abstract drafted
          done: false
    - item: Introduction
    - item: Methods
    - item: Results
    - item: Discussion
    - item: Figures & Tables
    - item: References
```

🔖 TaskNode Schema

The YAML schema for the recursive `TaskNode` structure is defined in
[`schemas/tasknode.schema.yaml`](schemas/tasknode.schema.yaml). It supports
unlimited nesting via `subtasks`, includes a `done` flag for completion, and
allows per-node progress overrides with the optional `percent` field.

📚 Guideline Utilities

        •       `append_guideline.py` – append a new guideline entry to `journal_guidelines.json`
        •       `validate_json.py` – verify that `journal_guidelines.json` is valid JSON

See [`FORMAT.md`](FORMAT.md) for the guideline schema.

⸻

🤝 Contributing

Contributions are welcome! Please read the Contributing Guide and Code of Conduct.

⸻

📜 License

Distributed under the MIT License—see LICENSE for details.

⸻

🙏 Acknowledgements
	•	Editorial teams at Cell Press, Nature, and Science for their public checklists
	•	The open-source community for inspiration and feedback

⸻

“Writing is thinking, so whenever you can’t think, write.” — Richard P. Feynman
