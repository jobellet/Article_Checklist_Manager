📝 Article Checklist Manager

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/jobellet/Article_Checklist_Manager/blob/main/Colab_Tutorial.ipynb)

An open-source tool that helps research teams track, from the top-level section down to the tiniest to-do, how close a manuscript is to being submission-ready.

⸻

🚀 Project Goal
	1.	Create a dedicated project for each manuscript (acm init <ProjectName>).
	2.	Generate a hierarchical checklist that you can break into any number of sections and nested sub-tasks (e.g. Title & Abstract → Abstract quality → Word count check).
	3.	Visualize progress with percentage bars at every level: per sub-task, per parent section, and overall.
	4.	Adapt the checklist to journal-specific requirements (e.g. Cell Press STAR Methods, Nature Reporting Summary, data availability statements).

⸻

🧩 Key Features (MVP)
	•	Initialize a new article project with acm init <ProjectName>
	•	Generate a starter YAML checklist template that you can edit freely
	•	Update the status or percentage of any task: acm check "Methods/STAR Methods/Key resources table" --done or --percent 60
	•	Display a CLI dashboard that aggregates completion across the hierarchy
	•	Export the checklist to Markdown or PDF for internal review

⸻

🗺️ Roadmap

0.1 — CLI Prototype
	•	Flexible YAML schema supporting unlimited nesting depth
	•	Multi-project management
	•	Core commands: init, status, check, uncheck, rename, delete
	•	ASCII progress-bar rendering at each nested level

0.2 — Journal Templates
	•	Built-in templates for Cell Press (STAR Methods), Nature, Science
	•	Automatic validation of mandatory checklist items

0.3 — GUI (Electron / Tauri)
	•	Drag-and-drop to re-order and nest tasks
	•	Git & GitHub Issues sync
	•	Real-time collaboration (WebSocket)

1.0 — Stable Release
	•	ORCID & DOI integration for auto-fill
	•	Export scripts for major submission portals
	•	Internationalization (EN, FR, ES)

⸻

🔧 Quick Install (CLI Prototype)

Clone the repository and install it locally until the PyPI release is available:

```bash
git clone https://github.com/jobellet/Article_Checklist_Manager.git
cd Article_Checklist_Manager
pip install -e .
acm init MyGreatPaper
acm status
acm check "Results/Fig 3/Statistical review" --percent 75
```


⸻

📝 Sample Checklist (YAML)

TitleAndAbstract:
  percent: 50          # auto-calculated
  tasks:
    - item: "Abstract ≤ 250 words"
      done: true
    - item: "Keywords defined"
      done: false
Methods:
  tasks:
    - item: "STAR Methods compliant"
      percent: 40      # overrides auto-calc if you want
      subtasks:
        - item: "Key resources table"
          done: true
        - item: "Lead contact"
          done: false
        - item: "Materials availability"
          done: false

🔖 TaskNode Schema

The YAML schema for the recursive `TaskNode` structure is defined in
[`schemas/tasknode.schema.yaml`](schemas/tasknode.schema.yaml). It supports
unlimited nesting via `subtasks`, includes a `done` flag for completion, and
allows per-node progress overrides with the optional `percent` field.

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
