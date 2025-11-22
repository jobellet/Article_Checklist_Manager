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

const SECTION_KEYWORDS = {
  introduction: "Introduction",
  background: "Introduction",
  method: "Methods",
  methods: "Methods",
  "materials and methods": "Methods",
  methodology: "Methods",
  result: "Results",
  results: "Results",
  discussion: "Discussion",
  conclusion: "Conclusion",
  conclusions: "Conclusion",
  abstract: "Abstract",
};

let guidelines = [];
let project = null;
let selectedSections = new Set(MANUSCRIPT_SECTION_OPTIONS.slice(0, 5));
let fileMeta = { name: "", ext: "", status: "No file uploaded yet.", hint: "" };
let manuscriptSections = [];
let totalWords = 0;
let selectedJournal = "";
let selectedArticleType = "";

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
  journalChecker: document.getElementById("journal-checker"),
  journalSelect: document.getElementById("journal-select"),
  articleTypeSelect: document.getElementById("article-type-select"),
  analysisSummary: document.getElementById("analysis-summary"),
  changeResults: document.getElementById("change-results"),
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

function categorizeSection(title) {
  const lowered = title.toLowerCase();
  for (const [key, category] of Object.entries(SECTION_KEYWORDS)) {
    if (lowered.includes(key)) return category;
  }
  return "Other";
}

function parseWordLimit(limit) {
  if (!limit) return null;
  const match = limit.match(/(\d[\d,]*)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function requiredCategories(structure) {
  if (!structure) return new Set();
  const categories = new Set();
  const lower = structure.toLowerCase();
  for (const [key, category] of Object.entries(SECTION_KEYWORDS)) {
    if (lower.includes(key)) categories.add(category);
  }
  return categories;
}

async function parseDocxSections(file) {
  if (!window.JSZip) throw new Error("JSZip is unavailable in this browser.");
  const buffer = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));

  const sections = [];
  let currentTitle = null;
  let wordCount = 0;

  const getText = (p) =>
    Array.from(p.getElementsByTagName("w:t"))
      .map((t) => t.textContent)
      .join("")
      .trim();

  const isHeading = (p) => {
    const styleNode = p.getElementsByTagName("w:pStyle")[0];
    if (!styleNode) return false;
    const style = styleNode.getAttribute("w:val") || styleNode.getAttribute("val") || "";
    return style.toLowerCase().startsWith("heading");
  };

  for (const p of paragraphs) {
    const text = getText(p);
    if (!text) continue;

    if (isHeading(p)) {
      if (currentTitle !== null) {
        sections.push({
          title: currentTitle,
          word_count: wordCount,
          category: categorizeSection(currentTitle),
        });
      }
      currentTitle = text;
      wordCount = 0;
    } else {
      wordCount += text.split(/\s+/).filter(Boolean).length;
    }
  }

  if (currentTitle === null) {
    const total = paragraphs
      .map(getText)
      .filter(Boolean)
      .reduce((acc, value) => acc + value.split(/\s+/).filter(Boolean).length, 0);
    return [{ title: "Document", word_count: total, category: "Other" }];
  }

  sections.push({ title: currentTitle, word_count: wordCount, category: categorizeSection(currentTitle) });
  return sections;
}

function renderAnalysisSummary() {
  if (!els.analysisSummary) return;
  const summary = els.analysisSummary;
  summary.innerHTML = "";
  const heading = document.createElement("p");
  heading.className = "label";
  heading.textContent = "Manuscript snapshot";
  summary.appendChild(heading);

  if (!manuscriptSections.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Upload a .docx file to extract sections and word counts.";
    summary.appendChild(hint);
    return;
  }

  const stats = document.createElement("div");
  stats.className = "grid grid--two";

  const sectionsStat = document.createElement("div");
  sectionsStat.innerHTML = `<p class="muted">Detected sections</p><p class="percent">${manuscriptSections.length}</p>`;

  const wordStat = document.createElement("div");
  wordStat.innerHTML = `<p class="muted">Total words</p><p class="percent">${totalWords}</p>`;

  stats.appendChild(sectionsStat);
  stats.appendChild(wordStat);
  summary.appendChild(stats);

  const pills = document.createElement("div");
  pills.className = "actions";
  const categories = new Set(manuscriptSections.map((s) => s.category).filter((c) => c && c !== "Other"));
  if (!categories.size) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = "No categorized sections detected";
    pills.appendChild(pill);
  } else {
    categories.forEach((category) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = category;
      pills.appendChild(pill);
    });
  }
  summary.appendChild(pills);
}

function renderChangeResults(changes, guideline) {
  if (!els.changeResults) return;
  const container = els.changeResults;
  container.classList.remove("muted");
  container.innerHTML = "";

  if (!manuscriptSections.length) {
    container.classList.add("muted");
    container.innerHTML = "<p>Upload a .docx manuscript to run journal checks.</p>";
    return;
  }

  const card = document.createElement("div");
  card.className = "change-results";
  const title = document.createElement("h3");
  title.textContent = guideline ? `${guideline.journal} — ${guideline.article_type}` : "Journal fit";
  card.appendChild(title);

  if (!guideline) {
    card.appendChild(document.createTextNode("Select a journal to see change requests."));
    container.appendChild(card);
    return;
  }

  if (!changes.length) {
    const para = document.createElement("p");
    para.textContent = "No required changes detected. This manuscript fits the selected journal limits.";
    card.appendChild(para);
    container.appendChild(card);
    return;
  }

  const list = document.createElement("ol");
  list.className = "change-results__list";
  changes.forEach((change) => {
    const li = document.createElement("li");
    li.textContent = change;
    list.appendChild(li);
  });

  card.appendChild(list);
  container.appendChild(card);
}

function evaluateAgainstGuideline(guideline) {
  const changeList = [];
  const required = requiredCategories(guideline.structure);
  const manuscriptCats = new Set(manuscriptSections.map((s) => s.category).filter((c) => c !== "Other"));
  const missing = [...required].filter((cat) => !manuscriptCats.has(cat)).sort();
  if (missing.length) {
    changeList.push(`Add sections covering: ${missing.join(", ")}`);
  }

  const limit = parseWordLimit(guideline.word_limit);
  if (limit && totalWords > limit) {
    changeList.push(`Total word count ${totalWords} exceeds ${limit} limit by ${totalWords - limit} words`);
  }

  const abstractLimit = parseWordLimit(guideline.abstract_limit);
  if (abstractLimit) {
    const abstractSection = manuscriptSections.find((s) => s.category === "Abstract");
    if (abstractSection && abstractSection.word_count > abstractLimit) {
      changeList.push(
        `Abstract ${abstractSection.word_count}/${abstractLimit} words (reduce by ${abstractSection.word_count - abstractLimit})`
      );
    }
  }

  return changeList;
}

function updateArticleTypes() {
  if (!els.journalSelect || !els.articleTypeSelect) return;
  const journal = els.journalSelect.value;
  const types = guidelines.filter((g) => g.journal === journal).map((g) => g.article_type);
  els.articleTypeSelect.innerHTML = "";
  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    els.articleTypeSelect.appendChild(option);
  });
  selectedJournal = journal;
  selectedArticleType = types[0] || "";
}

function updateJournalResults() {
  if (!guidelines.length || !els.journalSelect || !els.articleTypeSelect) return;
  const journal = els.journalSelect.value;
  const articleType = els.articleTypeSelect.value;
  selectedJournal = journal;
  selectedArticleType = articleType;
  const guideline = guidelines.find((g) => g.journal === journal && g.article_type === articleType);
  const changes = guideline ? evaluateAgainstGuideline(guideline) : [];
  renderChangeResults(changes, guideline);
}

async function loadGuidelines() {
  try {
    const response = await fetch("journal_guidelines.json");
    guidelines = await response.json();
    if (!els.journalSelect || !els.articleTypeSelect) return;
    const journals = Array.from(new Set(guidelines.map((g) => g.journal)));
    els.journalSelect.innerHTML = "";
    journals.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      els.journalSelect.appendChild(option);
    });
    updateArticleTypes();
    updateJournalResults();
  } catch (err) {
    console.error("Failed to load guidelines", err);
  }
}

function resetAnalysis() {
  manuscriptSections = [];
  totalWords = 0;
  toggleHidden(els.journalChecker, true);
  renderAnalysisSummary();
  renderChangeResults([], null);
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
  resetAnalysis();
  updateFileSummary(`${filename} loaded`, "Checklist populated from JSON.");
  render();
}

async function handleManuscriptUpload(event) {
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
  } else if (ext === "docx") {
    project = null;
    selectedSections = new Set(MANUSCRIPT_SECTION_OPTIONS.slice(0, 5));
    toggleHidden(els.sectionPicker, false);
    try {
      manuscriptSections = await parseDocxSections(file);
      totalWords = manuscriptSections.reduce((acc, section) => acc + section.word_count, 0);
      toggleHidden(els.journalChecker, false);
      renderAnalysisSummary();
      updateJournalResults();
      renderSectionOptions();
      updateFileSummary(
        `${file.name} analyzed`,
        "Section counts extracted. Select a journal to see required changes."
      );
    } catch (err) {
      resetAnalysis();
      updateFileSummary(`Unable to read ${file.name}`, err.message);
      alert("Unable to parse manuscript: " + err.message);
    }
    render();
  } else if (["doc", "odt"].includes(ext)) {
    resetAnalysis();
    project = null;
    selectedSections = new Set(MANUSCRIPT_SECTION_OPTIONS.slice(0, 5));
    renderSectionOptions();
    toggleHidden(els.sectionPicker, false);
    updateFileSummary(
      `${file.name} uploaded`,
      "Doc and ODT files are supported for checklist building but not automated journal checks yet."
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

  if (els.journalSelect) {
    els.journalSelect.addEventListener("change", () => {
      updateArticleTypes();
      updateJournalResults();
    });
  }
  if (els.articleTypeSelect) {
    els.articleTypeSelect.addEventListener("change", updateJournalResults);
  }
}

renderSectionOptions();
updateFileSummary(fileMeta.status, fileMeta.hint);
resetAnalysis();
loadGuidelines();
renderAnalysisSummary();
attachEvents();
render();
