import { loadGuidelines } from "./data/guidelines-loader.js";
import { wireValidationStatus } from "./validate/validation-status.js";

const SECTION_KEYWORDS = {
  introduction: "Introduction",
  background: "Introduction",
  method: "Methods",
  methods: "Methods",
  "materials and methods": "Methods",
  materials: "Methods",
  methodology: "Methods",
  approach: "Methods",
  result: "Results",
  results: "Results",
  discussion: "Discussion",
  conclusion: "Conclusion",
  conclusions: "Conclusion",
  abstract: "Abstract",
};

let guidelines = [];
let filteredGuidelines = [];
let manuscriptSections = [];
let totalWords = 0;
let figureReferenceCount = 0;
let figureFileCount = 0;
let selectedGuideline = null;

const els = {
  manuscriptUpload: document.getElementById("manuscript-upload"),
  figureUpload: document.getElementById("figure-upload"),
  manuscriptStatus: document.getElementById("manuscript-status"),
  figureStatus: document.getElementById("figure-status"),
  journalFilter: document.getElementById("journal-filter"),
  journalSelect: document.getElementById("journal-select"),
  analysisSummary: document.getElementById("analysis-summary"),
  changeResults: document.getElementById("change-results"),
};

const manuscriptWorker = typeof Worker !== "undefined" ? new Worker("parsers/manuscript.worker.js") : null;
const validationWorker =
  typeof Worker !== "undefined" ? new Worker("validate/validate-guidelines.worker.js", { type: "module" }) : null;

wireValidationStatus(validationWorker);

function categorizeSection(title) {
  const lowered = title.toLowerCase();
  for (const [key, category] of Object.entries(SECTION_KEYWORDS)) {
    if (lowered.includes(key)) return category;
  }
  return "Other";
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function countFigureMentionsFromText(text) {
  if (!text) return 0;
  let count = 0;
  let figureNumber = 1;
  while (true) {
    const regex = new RegExp(`\\b[Ff]igure\\s+${figureNumber}\\b`);
    if (regex.test(text)) {
      count += 1;
      figureNumber += 1;
    } else {
      break;
    }
  }
  return count;
}

async function parseDocxFile(file) {
  if (!window.JSZip) throw new Error("JSZip is unavailable in this browser.");
  const buffer = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));

  const sections = [];
  const textContent = [];
  const sectionStack = [];
  let preambleWords = 0;

  const getText = (p) =>
    Array.from(p.getElementsByTagName("w:t"))
      .map((t) => t.textContent)
      .join("")
      .trim();

  const headingLevel = (p) => {
    const style = Array.from(p.getElementsByTagName("w:pStyle")).find((s) => s.getAttribute("w:val")?.startsWith("Heading"));
    if (!style) return null;
    const match = style.getAttribute("w:val").match(/Heading\s*([0-9]+)/i) || style.getAttribute("w:val").match(/Heading([0-9]+)/i);
    return match ? Number(match[1]) : 1;
  };

  const closeSections = (level) => {
    while (sectionStack.length && sectionStack[sectionStack.length - 1].level >= level) {
      const finished = sectionStack.pop();
      sections.push({
        title: finished.title,
        word_count: finished.word_count,
        category: categorizeSection(finished.title),
      });
    }
  };

  for (const p of paragraphs) {
    const text = getText(p);
    if (!text) continue;
    textContent.push(text);

    const level = headingLevel(p);
    if (level !== null) {
      closeSections(level);
      sectionStack.push({ title: text, level, word_count: 0 });
    } else if (sectionStack.length) {
      sectionStack[sectionStack.length - 1].word_count += text.split(/\s+/).filter(Boolean).length;
    } else {
      preambleWords += text.split(/\s+/).filter(Boolean).length;
    }
  }

  closeSections(0);

  if (!sections.length && preambleWords) {
    sections.push({ title: file.name, word_count: preambleWords, category: "Other" });
  }

  return { sections: sections.length ? sections : [{ title: file.name, word_count: 0, category: "Other" }], textContent: textContent.join("\n") };
}

async function parsePlainTextFile(file) {
  const text = await file.text();
  const words = countWords(text);
  return { sections: [{ title: file.name, word_count: words, category: "Other" }], textContent: text };
}

async function parseMarkdownFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const sections = [];
  const sectionStack = [];
  let buffer = [];
  let preambleWords = 0;

  const flushTextToCurrent = () => {
    if (!buffer.length) return;
    const content = buffer.join(" ").trim();
    if (!content) return;
    if (!sectionStack.length) {
      preambleWords += countWords(content);
    } else {
      sectionStack[sectionStack.length - 1].word_count += countWords(content);
    }
    buffer = [];
  };

  const closeSections = (level) => {
    while (sectionStack.length && sectionStack[sectionStack.length - 1].level >= level) {
      const finished = sectionStack.pop();
      sections.push({ title: finished.title, word_count: finished.word_count, category: categorizeSection(finished.title) });
    }
  };

  lines.forEach((line) => {
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading) {
      flushTextToCurrent();
      const level = heading[1].length;
      closeSections(level);
      sectionStack.push({ title: heading[2].trim(), level, word_count: 0 });
    } else {
      buffer.push(line);
    }
  });

  flushTextToCurrent();
  closeSections(0);

  if (!sections.length && preambleWords) {
    return { sections: [{ title: file.name, word_count: preambleWords, category: "Other" }], textContent: text };
  }

  return { sections: sections.length ? sections : [{ title: file.name, word_count: 0, category: "Other" }], textContent: text };
}

async function parseManuscriptFileLocally(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "docx":
      return parseDocxFile(file);
    case "txt":
      return parsePlainTextFile(file);
    case "md":
    case "markdown":
      return parseMarkdownFile(file);
    default:
      throw new Error(`Unsupported file type: .${ext}. Upload .docx, .txt, or .md/.markdown files.`);
  }
}

function parseManuscriptFile(file) {
  if (!manuscriptWorker) {
    return parseManuscriptFileLocally(file);
  }

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      const { type, data, error } = event.data || {};
      if (type === "manuscript:parsed") {
        cleanup();
        resolve(data);
      } else if (type === "manuscript:error") {
        cleanup();
        reject(new Error(error || "Unable to parse manuscript."));
      }
    };

    const handleError = (err) => {
      cleanup();
      const message = err instanceof Error ? err.message : "Unable to parse manuscript in worker.";
      reject(new Error(message));
    };

    const cleanup = () => {
      manuscriptWorker.removeEventListener("message", handleMessage);
      manuscriptWorker.removeEventListener("error", handleError);
    };

    manuscriptWorker.addEventListener("message", handleMessage);
    manuscriptWorker.addEventListener("error", handleError);
    manuscriptWorker.postMessage({ file });
  }).catch((err) =>
    parseManuscriptFileLocally(file).catch((localErr) => Promise.reject(localErr || err))
  );
}

function renderAnalysisSummary() {
  if (!els.analysisSummary) return;
  const summary = els.analysisSummary;
  summary.innerHTML = "";

  if (!manuscriptSections.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Upload a supported manuscript file (.docx, .txt, .md) to extract sections and word counts.";
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
  if (figureReferenceCount || figureFileCount) {
    const figureStat = document.createElement("div");
    const mentionsLabel = figureReferenceCount ? `${figureReferenceCount} mentioned` : "No mentions";
    figureStat.innerHTML = `<p class="muted">Figures</p><p class="percent">${mentionsLabel}${figureFileCount ? ` · ${figureFileCount} uploaded` : " (uploads optional)"}</p>`;
    stats.appendChild(figureStat);
  }
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

  const figureNote = document.createElement("p");
  figureNote.className = "muted";
  if (figureReferenceCount) {
    figureNote.textContent = `${figureReferenceCount} figure reference${figureReferenceCount === 1 ? "" : "s"} detected via "Figure n" labels.`;
  } else {
    figureNote.textContent = "No figure references detected in the manuscript.";
  }
  summary.appendChild(figureNote);
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

function expectedSectionsForGuideline(guideline) {
  const detected = requiredCategories(guideline.structure);
  if (detected.size) return [...detected];
  return ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"].filter(Boolean);
}

function aggregateWordsByCategory(sections) {
  return sections.reduce((acc, section) => {
    const key = section.category || "Other";
    acc[key] = (acc[key] || 0) + section.word_count;
    return acc;
  }, {});
}

function buildExpectedWordMap(guideline, expectedCategories) {
  const limit = parseWordLimit(guideline.word_limit);
  if (!limit || !expectedCategories.length) return {};
  const perSection = Math.round(limit / expectedCategories.length);
  return expectedCategories.reduce((acc, cat) => ({ ...acc, [cat]: perSection }), {});
}

function evaluateAgainstGuideline(guideline) {
  const changeList = [];
  const expectedCategories = expectedSectionsForGuideline(guideline);
  const manuscriptCats = new Set(manuscriptSections.map((s) => s.category).filter((c) => c !== "Other"));
  const missing = expectedCategories.filter((cat) => !manuscriptCats.has(cat)).sort();
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
      changeList.push(`Abstract ${abstractSection.word_count}/${abstractLimit} words (reduce by ${abstractSection.word_count - abstractLimit})`);
    }
  }

  const byCategory = aggregateWordsByCategory(manuscriptSections);
  const expectedWordMap = buildExpectedWordMap(guideline, expectedCategories);

  const sectionDetails = expectedCategories.map((category) => {
    const actual = byCategory[category] || 0;
    const expected = expectedWordMap[category] || null;
    const ratio = expected ? (actual / expected).toFixed(2) : "n/a";
    return { category, actual, expected, ratio };
  });

  return { changeList, sectionDetails };
}

function renderChangeResults() {
  if (!els.changeResults) return;
  const container = els.changeResults;
  container.classList.remove("muted");
  container.innerHTML = "";

  if (!selectedGuideline) {
    container.classList.add("muted");
    container.innerHTML = "<p>Loading journal options…</p>";
    return;
  }

  if (!manuscriptSections.length) {
    container.classList.add("muted");
    container.innerHTML = "<p>Upload a manuscript to run journal checks.</p>";
    return;
  }

  const { changeList, sectionDetails } = evaluateAgainstGuideline(selectedGuideline);
  const card = document.createElement("div");
  card.className = "change-results";

  const title = document.createElement("h3");
  title.textContent = `${selectedGuideline.journal} — ${selectedGuideline.article_type}`;
  card.appendChild(title);

  if (!changeList.length) {
    const para = document.createElement("p");
    para.textContent = "No required changes detected. This manuscript fits the selected journal limits.";
    card.appendChild(para);
    container.appendChild(card);
    return;
  }

  const list = document.createElement("ol");
  list.className = "change-results__list";
  changeList.forEach((change) => {
    const li = document.createElement("li");
    li.textContent = change;
    list.appendChild(li);
  });

  card.appendChild(list);

  const sectionTable = document.createElement("div");
  sectionTable.className = "section-ratios";
  const heading = document.createElement("h4");
  heading.textContent = "Expected sections";
  sectionTable.appendChild(heading);

  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Section</th><th>Actual words</th><th>Expected words</th><th>Actual/Expected</th></tr></thead>";
  const tbody = document.createElement("tbody");
  sectionDetails.forEach((detail) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${detail.category}</td><td>${detail.actual}</td><td>${detail.expected ?? "n/a"}</td><td>${detail.ratio}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  sectionTable.appendChild(table);
  card.appendChild(sectionTable);
  container.appendChild(card);
}

function populateJournalOptions() {
  if (!els.journalSelect) return;
  const query = (els.journalFilter.value || "").toLowerCase();
  filteredGuidelines = guidelines.filter((g) => `${g.journal} ${g.article_type}`.toLowerCase().includes(query));

  els.journalSelect.innerHTML = "";

  if (!filteredGuidelines.length) {
    const option = document.createElement("option");
    option.textContent = "No matches";
    option.disabled = true;
    option.selected = true;
    els.journalSelect.appendChild(option);
    selectedGuideline = null;
    renderChangeResults();
    return;
  }

  filteredGuidelines.forEach((entry, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = `${entry.journal} — ${entry.article_type}`;
    els.journalSelect.appendChild(option);
  });

  const selectedIndex = Number(els.journalSelect.value || 0);
  selectedGuideline = filteredGuidelines[selectedIndex] || filteredGuidelines[0];
  els.journalSelect.value = String(filteredGuidelines.indexOf(selectedGuideline));
  renderChangeResults();
}

async function initializeGuidelines() {
  try {
    guidelines = await loadGuidelines();
    populateJournalOptions();
  } catch (err) {
    console.error("Failed to load guidelines", err);
    if (els.changeResults) {
      els.changeResults.innerHTML = "<p class='muted'>Unable to load journal guidelines.</p>";
    }
  }
}

async function handleManuscriptUpload(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const parsed = await parseManuscriptFile(file);
    manuscriptSections = parsed.sections;
    totalWords = manuscriptSections.reduce((acc, section) => acc + section.word_count, 0);
    figureReferenceCount = countFigureMentionsFromText(parsed.textContent);
    els.manuscriptStatus.textContent = `${file.name} uploaded and analyzed.`;
    renderAnalysisSummary();
    renderChangeResults();
  } catch (err) {
    manuscriptSections = [];
    totalWords = 0;
    figureReferenceCount = 0;
    els.manuscriptStatus.textContent = `Unable to read ${file.name}: ${err.message}`;
    renderAnalysisSummary();
    renderChangeResults();
  }

  event.target.value = "";
}

function handleFigureUpload(event) {
  const files = Array.from(event.target.files || []);
  figureFileCount = files.length;
  if (!files.length) {
    els.figureStatus.textContent = "Figures optional; no uploads yet.";
    event.target.value = "";
    renderAnalysisSummary();
    return;
  }
  const names = files.map((f) => f.name).join(", ");
  els.figureStatus.textContent = `${files.length} file${files.length === 1 ? "" : "s"} uploaded: ${names}`;
  event.target.value = "";
  renderAnalysisSummary();
}

function attachEvents() {
  if (els.journalFilter) {
    els.journalFilter.addEventListener("input", populateJournalOptions);
  }

  if (els.journalSelect) {
    els.journalSelect.addEventListener("change", () => {
      const idx = Number(els.journalSelect.value);
      selectedGuideline = filteredGuidelines[idx];
      renderChangeResults();
    });
  }

  if (els.manuscriptUpload) {
    els.manuscriptUpload.addEventListener("change", handleManuscriptUpload);
  }

  if (els.figureUpload) {
    els.figureUpload.addEventListener("change", handleFigureUpload);
  }
}

renderAnalysisSummary();
renderChangeResults();
initializeGuidelines();
attachEvents();
