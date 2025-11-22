import { ArticleProject, Checklist, TaskNode, createDemoProject } from "./checklist.js";

const MANUSCRIPT_SECTION_OPTIONS = [
  "Title & Abstract",
  "Introduction",
  "Methods",
  "Results",
  "Discussion",
  "Figures & Tables",
  "Supplementary material",
  "References",
];

let project = null;
let selectedSections = new Set(MANUSCRIPT_SECTION_OPTIONS.slice(0, 5));
let fileMeta = { name: "", ext: "", status: "No file uploaded yet.", hint: "" };

const els = {
  nameInput: document.getElementById("project-name"),
  overallBar: document.getElementById("overall-bar"),
  overallPercent: document.getElementById("overall-percent"),
  tasks: document.getElementById("tasks"),
  tasksPanel: document.getElementById("tasks-panel"),
  emptyState: document.getElementById("empty-state"),
  newTaskForm: document.getElementById("new-task-form"),
  newTaskName: document.getElementById("new-task-name"),
  addTaskButton: document.querySelector("#new-task-form button"),
  rawJson: document.getElementById("raw-json"),
  jsonTools: document.getElementById("json-tools"),
  exportJson: document.getElementById("export-json"),
  copyJson: document.getElementById("copy-json"),
  applyJson: document.getElementById("apply-json"),
  importJsonFile: document.getElementById("import-json-file"),
  manuscriptUpload: document.getElementById("manuscript-upload"),
  resetDemo: document.getElementById("reset-demo"),
  sectionPicker: document.getElementById("section-picker"),
  sectionOptions: document.getElementById("section-options"),
  applySections: document.getElementById("apply-sections"),
  clearSections: document.getElementById("clear-sections"),
  fileStatus: document.getElementById("file-status"),
  fileHint: document.getElementById("file-hint"),
};

const template = document.getElementById("task-template");

function toggleHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", hidden);
}

function updateFileSummary(status, hint = "") {
  fileMeta.status = status;
  fileMeta.hint = hint;
  if (els.fileStatus) els.fileStatus.textContent = status;
  if (els.fileHint) els.fileHint.textContent = hint;
}

function renderSectionOptions() {
  if (!els.sectionOptions) return;
  els.sectionOptions.innerHTML = "";
  MANUSCRIPT_SECTION_OPTIONS.forEach((label) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip${selectedSections.has(label) ? " chip--active" : ""}`;
    chip.textContent = label;
    chip.addEventListener("click", () => {
      if (selectedSections.has(label)) selectedSections.delete(label);
      else selectedSections.add(label);
      renderSectionOptions();
    });
    els.sectionOptions.appendChild(chip);
  });
}

function render() {
  const hasProject = project instanceof ArticleProject;
  const overall = hasProject ? project.computedPercent() : 0;
  els.nameInput.value = hasProject ? project.name : "";
  els.overallBar.style.width = `${overall.toFixed(1)}%`;
  els.overallPercent.textContent = `${overall.toFixed(1)}%`;
  els.rawJson.value = hasProject ? project.toJSON() : "";

  toggleHidden(els.tasks, !hasProject);
  toggleHidden(els.emptyState, hasProject);
  toggleHidden(els.jsonTools, !hasProject);
  if (els.exportJson) els.exportJson.disabled = !hasProject;
  if (els.newTaskName) els.newTaskName.disabled = !hasProject;
  if (els.addTaskButton) els.addTaskButton.disabled = !hasProject;

  if (!hasProject) {
    els.tasks.innerHTML = "";
    return;
  }

  els.tasks.innerHTML = "";
  project.checklist.tasks.forEach((task, index) => {
    const node = renderTask(task, [index]);
    els.tasks.appendChild(node);
  });
}

function renderTask(task, path) {
  const clone = template.content.cloneNode(true);
  const article = clone.querySelector(".task");
  article.dataset.path = path.join(".");

  const title = clone.querySelector(".task__title");
  title.textContent = task.item || "Untitled";

  const controls = clone.querySelector(".task__controls");
  const status = document.createElement("span");
  status.className = "badge";
  status.textContent = task.done ? "Done" : "In progress";
  controls.appendChild(status);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = task.done ? "Mark as not done" : "Mark done";
  toggle.addEventListener("click", () => {
    task.done = !task.done;
    if (task.done) task.percent = 100;
    else if (task.percent === 100) task.percent = null;
    render();
  });
  controls.appendChild(toggle);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 100;
  slider.value = task.percent ?? task.computedPercent();
  slider.className = "slider";
  slider.title = "Set explicit percent (overrides subtasks)";
  slider.addEventListener("input", (e) => {
    task.percent = Number(e.target.value);
    task.done = task.percent >= 100;
    render();
  });
  controls.appendChild(slider);

  const progressBar = clone.querySelector(".progress__bar");
  const pctLabel = clone.querySelector(".percent");
  const pct = task.computedPercent();
  progressBar.style.width = `${pct.toFixed(1)}%`;
  pctLabel.textContent = `${pct.toFixed(1)}%`;

  const actions = clone.querySelector(".task__actions");
  const addSub = document.createElement("button");
  addSub.type = "button";
  addSub.textContent = "Add subtask";
  addSub.addEventListener("click", () => {
    const item = prompt("Subtask name?");
    if (!item) return;
    task.addSubtask(new TaskNode({ item }));
    render();
  });
  actions.appendChild(addSub);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    removeTaskByPath(path);
    render();
  });
  actions.appendChild(deleteBtn);

  const childrenContainer = clone.querySelector(".task__children");
  task.subtasks.forEach((child, idx) => {
    const childNode = renderTask(child, [...path, idx]);
    childrenContainer.appendChild(childNode);
  });

  return clone;
}

function removeTaskByPath(path) {
  if (!path.length) return;
  const lastIndex = path[path.length - 1];
  const parent = findParent(path);
  if (Array.isArray(parent)) {
    parent.splice(lastIndex, 1);
  }
}

function findParent(path) {
  let cursor = project.checklist.tasks;
  for (let i = 0; i < path.length - 1; i++) {
    const index = path[i];
    if (!cursor?.[index]) return null;
    cursor = cursor[index].subtasks;
  }
  return cursor;
}

function loadProjectFromJson(text, filename = "JSON project") {
  project = ArticleProject.fromJSON(text);
  selectedSections.clear();
  toggleHidden(els.sectionPicker, true);
  updateFileSummary(`${filename} loaded`, "Checklist populated from JSON.");
  render();
}

function handleManuscriptUpload(event) {
  const [file] = event.target.files;
  if (!file) return;

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  fileMeta = { ...fileMeta, name: file.name.replace(/\.[^.]+$/, ""), ext };

  if (ext === "json") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        loadProjectFromJson(e.target.result, file.name);
      } catch (err) {
        updateFileSummary(`Unable to parse ${file.name}`, err.message);
        alert("Unable to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  } else if (["doc", "docx", "odt"].includes(ext)) {
    project = null;
    selectedSections = new Set(MANUSCRIPT_SECTION_OPTIONS.slice(0, 5));
    renderSectionOptions();
    toggleHidden(els.sectionPicker, false);
    updateFileSummary(
      `${file.name} uploaded`,
      "Choose the sections that exist to generate the checklist. Parameters stay hidden until you pick them."
    );
    render();
  } else {
    updateFileSummary(`Unsupported file type: ${file.name}`, "Use .doc, .docx, .odt, or .json files.");
  }

  event.target.value = "";
}

function buildChecklistFromSections() {
  if (!selectedSections.size) {
    alert("Pick at least one section to build the checklist.");
    return;
  }

  project = new ArticleProject({
    name: fileMeta.name ? `${fileMeta.name} checklist` : "Manuscript checklist",
    checklist: new Checklist({
      tasks: Array.from(selectedSections).map((item) => ({ item })),
    }),
  });
  updateFileSummary(
    `Checklist ready for ${selectedSections.size} section${selectedSections.size === 1 ? "" : "s"}.`,
    "Adjust progress in the task list or import JSON for deeper edits."
  );
  toggleHidden(els.sectionPicker, true);
  render();
}

function attachEvents() {
  els.nameInput.addEventListener("input", (e) => {
    if (!project) return;
    project.name = e.target.value;
    render();
  });

  els.newTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!project) {
      alert("Upload a document or load the demo to start adding tasks.");
      return;
    }
    const value = els.newTaskName.value.trim();
    if (!value) return;
    project.checklist.addTask(new TaskNode({ item: value }));
    els.newTaskName.value = "";
    render();
  });

  els.resetDemo.addEventListener("click", () => {
    project = createDemoProject();
    selectedSections = new Set();
    toggleHidden(els.sectionPicker, true);
    updateFileSummary("Demo project loaded", "Explore the checklist controls before uploading your own file.");
    render();
  });

  els.exportJson.addEventListener("click", () => {
    if (!project) {
      alert("No project to export yet.");
      return;
    }
    const blob = new Blob([project.toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name || "project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  els.manuscriptUpload.addEventListener("change", handleManuscriptUpload);

  els.applyJson.addEventListener("click", () => {
    try {
      loadProjectFromJson(els.rawJson.value.trim() || "{}", "JSON textarea");
    } catch (err) {
      updateFileSummary("Unable to parse JSON", err.message);
      alert("Unable to parse JSON: " + err.message);
    }
  });

  els.copyJson.addEventListener("click", async () => {
    if (!project) {
      alert("Nothing to copy yet—upload or create a checklist first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(project.toJSON());
    } catch (err) {
      alert("Clipboard copy failed: " + err.message);
    }
  });

  els.importJsonFile.addEventListener("change", (e) => {
    const [file] = e.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        loadProjectFromJson(event.target.result, file.name);
      } catch (err) {
        updateFileSummary(`Unable to parse ${file.name}`, err.message);
        alert("Unable to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  els.applySections.addEventListener("click", buildChecklistFromSections);
  els.clearSections.addEventListener("click", () => {
    selectedSections = new Set();
    renderSectionOptions();
  });
}

renderSectionOptions();
updateFileSummary(fileMeta.status, fileMeta.hint);
attachEvents();
render();
