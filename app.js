import { ArticleProject, Checklist, TaskNode, createDemoProject } from "./checklist.js";

let project = createDemoProject();

const els = {
  nameInput: document.getElementById("project-name"),
  overallBar: document.getElementById("overall-bar"),
  overallPercent: document.getElementById("overall-percent"),
  tasks: document.getElementById("tasks"),
  newTaskForm: document.getElementById("new-task-form"),
  newTaskName: document.getElementById("new-task-name"),
  rawJson: document.getElementById("raw-json"),
};

const template = document.getElementById("task-template");

function render() {
  els.nameInput.value = project.name;
  const overall = project.computedPercent();
  els.overallBar.style.width = `${overall.toFixed(1)}%`;
  els.overallPercent.textContent = `${overall.toFixed(1)}%`;
  els.rawJson.value = project.toJSON();

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

function attachEvents() {
  els.nameInput.addEventListener("input", (e) => {
    project.name = e.target.value;
    render();
  });

  els.newTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = els.newTaskName.value.trim();
    if (!value) return;
    project.checklist.addTask(new TaskNode({ item: value }));
    els.newTaskName.value = "";
    render();
  });

  document.getElementById("reset-demo").addEventListener("click", () => {
    project = createDemoProject();
    render();
  });

  document.getElementById("export-json").addEventListener("click", () => {
    const blob = new Blob([project.toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name || "project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-file").addEventListener("change", (e) => {
    const [file] = e.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        project = ArticleProject.fromJSON(event.target.result);
        render();
      } catch (err) {
        alert("Unable to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("apply-json").addEventListener("click", () => {
    try {
      project = ArticleProject.fromJSON(els.rawJson.value);
      render();
    } catch (err) {
      alert("Unable to parse JSON: " + err.message);
    }
  });

  document.getElementById("copy-json").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(project.toJSON());
    } catch (err) {
      alert("Clipboard copy failed: " + err.message);
    }
  });
}

attachEvents();
render();
