import { loadGuidelines } from "./data/guidelines-loader.js";
import { wireValidationStatus } from "./validate/validation-status.js";
import { detectSections, findCategoriesInText } from "./parsers/section-detector.js";

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
  journalSummary: document.getElementById("journal-summary"),
  exportMarkdown: document.getElementById("export-markdown"),
  analysisSummary: document.getElementById("analysis-summary"),
  changeResults: document.getElementById("change-results"),
};

if (els.exportMarkdown) {
  els.exportMarkdown.disabled = true;
}

const manuscriptWorker = typeof Worker !== "undefined" ? new Worker("parsers/manuscript.worker.js") : null;
const validationWorker =
  typeof Worker !== "undefined" ? new Worker("validate/validate-guidelines.worker.js", { type: "module" }) : null;

wireValidationStatus(validationWorker);

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeSearchValue(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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

async function parseDocxFile(file, onProgress = () => {}) {
  const reportProgress = onProgress || (() => {});
  if (!window.JSZip) throw new Error("JSZip is unavailable in this browser.");
  reportProgress("Reading .docx file", 0.05);
  const buffer = await file.arrayBuffer();
  reportProgress("Extracting document", 0.15);
  const zip = await window.JSZip.loadAsync(buffer);
  reportProgress("Parsing document XML", 0.25);
  const documentXml = await zip.file("word/document.xml").async("string");
  reportProgress("Analyzing document structure", 0.35);
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
      });
    }
  };

  for (const [idx, p] of paragraphs.entries()) {
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

    if (idx % 25 === 0) {
      const progress = 0.35 + (idx / (paragraphs.length || 1)) * 0.55;
      reportProgress("Analyzing document structure", Math.min(progress, 0.9));
    }
  }

  closeSections(0);

  if (!sections.length && preambleWords) {
    sections.push({ title: file.name, word_count: preambleWords });
  }

  reportProgress("Finishing analysis", 0.95);
  const categorized = detectSections(sections.length ? sections : [{ title: file.name, word_count: 0 }]);
  return { sections: categorized, textContent: textContent.join("\n") };
}

async function parsePlainTextFile(file, onProgress = () => {}) {
  const reportProgress = onProgress || (() => {});
  reportProgress("Reading text file", 0.1);
  const text = await file.text();
  const words = countWords(text);
  reportProgress("Finishing analysis", 0.95);
  return { sections: detectSections([{ title: file.name, word_count: words }]), textContent: text };
}

async function parseMarkdownFile(file, onProgress = () => {}) {
  const reportProgress = onProgress || (() => {});
  reportProgress("Reading markdown", 0.1);
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
      sections.push({ title: finished.title, word_count: finished.word_count });
    }
  };

  lines.forEach((line, idx) => {
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading) {
      flushTextToCurrent();
      const level = heading[1].length;
      closeSections(level);
      sectionStack.push({ title: heading[2].trim(), level, word_count: 0 });
    } else {
      buffer.push(line);
    }

    if (idx % 50 === 0) {
      const progress = 0.1 + (idx / (lines.length || 1)) * 0.75;
      reportProgress("Scanning markdown headings", Math.min(progress, 0.9));
    }
  });

  flushTextToCurrent();
  closeSections(0);

  reportProgress("Finishing analysis", 0.95);

  if (!sections.length && preambleWords) {
    return { sections: detectSections([{ title: file.name, word_count: preambleWords }]), textContent: text };
  }

  const categorized = detectSections(sections.length ? sections : [{ title: file.name, word_count: 0 }]);
  return { sections: categorized, textContent: text };
}

async function parseManuscriptFileLocally(file, onProgress) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "docx":
      return parseDocxFile(file, onProgress);
    case "txt":
      return parsePlainTextFile(file, onProgress);
    case "md":
    case "markdown":
      return parseMarkdownFile(file, onProgress);
    default:
      throw new Error(`Unsupported file type: .${ext}. Upload .docx, .txt, or .md/.markdown files.`);
  }
}

function parseManuscriptFile(file, onProgress) {
  const progressCallback = onProgress || (() => {});
  if (!manuscriptWorker) {
    return parseManuscriptFileLocally(file, progressCallback);
  }

  return new Promise((resolve, reject) => {
    const requestId = `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const handleMessage = (event) => {
      const { type, data, error, message, progress, requestId: incomingId } = event.data || {};
      if (incomingId !== requestId) return;
      if (type === "manuscript:parsed") {
        cleanup();
        resolve(data);
      } else if (type === "manuscript:error") {
        cleanup();
        reject(new Error(error || "Unable to parse manuscript."));
      } else if (type === "manuscript:progress") {
        progressCallback(message, progress);
      } else if (type === "manuscript:cancelled") {
        cleanup();
        reject(new Error("Parsing cancelled."));
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
    manuscriptWorker.postMessage({ type: "cancel" });
    manuscriptWorker.postMessage({ type: "parse", file, requestId });
  }).catch((err) => {
    if (err?.message === "Parsing cancelled.") {
      return Promise.reject(err);
    }
    return parseManuscriptFileLocally(file, progressCallback).catch((localErr) => Promise.reject(localErr || err));
  });
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

function parseNumericLimit(limit) {
  if (!limit) return null;
  const normalized = limit.toString().toLowerCase();
  const parseNumber = (value) => Number(String(value).replace(/,/g, ""));

  const rangeMatches = [...normalized.matchAll(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)/g)].flatMap((m) => [m[1], m[2]]);
  const withUnits = [...normalized.matchAll(/(\d[\d,]*)\s*(?:word|words|reference|references|figure|figures|table|tables|item|items)/g)].map(
    (m) => m[1]
  );
  const allNumbers = [...normalized.matchAll(/(\d[\d,]*)/g)].map((m) => m[1]);
  const candidates = [...rangeMatches, ...withUnits, ...allNumbers].map((num) => parseNumber(num)).filter(Boolean);
  if (candidates.length) {
    return Math.max(...candidates);
  }
  return null;
}

function parseWordLimit(limit) {
  return parseNumericLimit(limit);
}

function computeComplianceStatus(actual, limit) {
  const parsedLimit = typeof limit === "number" ? limit : parseNumericLimit(limit);
  if (!parsedLimit) return { status: "na", label: "No stated limit", limit: null, actual };
  if (actual === null || actual === undefined) return { status: "na", label: "No manuscript data", limit: parsedLimit, actual };
  const ratio = parsedLimit ? actual / parsedLimit : 0;
  if (ratio > 1) return { status: "over", label: "Over limit", limit: parsedLimit, actual };
  if (ratio >= 0.9) return { status: "warning", label: "Close to limit", limit: parsedLimit, actual };
  return { status: "ok", label: "Under limit", limit: parsedLimit, actual };
}

function createComplianceIndicator(status, detailText) {
  const indicator = document.createElement("span");
  indicator.className = `compliance-indicator compliance-indicator--${status.status}`;
  const glyph = document.createElement("span");
  glyph.className = `status-glyph status-glyph--${status.status}`;
  glyph.setAttribute("aria-hidden", "true");
  const srLabel = document.createElement("span");
  srLabel.className = "sr-only";
  srLabel.textContent = status.label;
  const text = document.createElement("span");
  text.textContent = detailText;
  indicator.appendChild(glyph);
  indicator.appendChild(srLabel);
  indicator.appendChild(text);
  return indicator;
}

function requiredCategories(structure) {
  if (!structure) return new Set();
  return findCategoriesInText(structure);
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

function sectionLimitStatus(actual, limit) {
  const status = computeComplianceStatus(actual, limit);
  if (!status.limit) return { status: status.status, label: "—" };
  return { status: status.status, label: `${actual} / ${status.limit} words` };
}

function buildExpectedWordMap(guideline, expectedCategories) {
  const limit = parseWordLimit(guideline.word_limit);
  if (!limit || !expectedCategories.length) return {};
  const perSection = Math.round(limit / expectedCategories.length);
  return expectedCategories.reduce((acc, cat) => ({ ...acc, [cat]: perSection }), {});
}

const SECTION_LIMIT_KEYS = {
  abstract_limit: "Abstract",
  introduction_limit: "Introduction",
  methods_limit: "Methods",
  results_limit: "Results",
  discussion_limit: "Discussion",
  conclusion_limit: "Conclusion",
  significance_statement_limit: "Significance Statement",
};

function sectionLimitsFromGuideline(guideline) {
  return Object.entries(SECTION_LIMIT_KEYS).reduce((acc, [key, category]) => {
    const parsed = parseWordLimit(guideline[key]);
    if (parsed) acc[category] = parsed;
    return acc;
  }, {});
}

function buildConstraintSummaries(
  guideline,
  {
    sections = manuscriptSections,
    totalWordsCount = totalWords,
    figureMentions = figureReferenceCount,
    figureUploads = figureFileCount,
    referenceCount = null,
  } = {}
) {
  const hasManuscriptData = Array.isArray(sections) && sections.length > 0;
  const hasFigureData =
    (figureMentions !== null && figureMentions !== undefined) || (figureUploads !== null && figureUploads !== undefined);
  const figureActual = hasFigureData ? Math.max(figureMentions ?? 0, figureUploads ?? 0) : null;
  const wordLimit = parseWordLimit(guideline.word_limit);
  const figureLimit = parseNumericLimit(guideline.figure_limit);
  const referenceLimit = parseNumericLimit(guideline.reference_limit);

  return [
    {
      key: "words",
      label: "Main text",
      limitText: guideline.word_limit || "Not specified",
      status: computeComplianceStatus(hasManuscriptData ? totalWordsCount : null, wordLimit),
      detail: wordLimit
        ? hasManuscriptData
          ? `${totalWordsCount || 0} / ${wordLimit} words`
          : `${wordLimit} words (limit)`
        : guideline.word_limit || "Limit not provided",
    },
    {
      key: "figures",
      label: "Figures/Tables",
      limitText: guideline.figure_limit || "Not specified",
      status: computeComplianceStatus(hasManuscriptData ? figureActual : null, figureLimit),
      detail: figureLimit
        ? hasManuscriptData && figureActual !== null
          ? `${figureActual} of ${figureLimit} items`
          : `${figureLimit} items (limit)`
        : guideline.figure_limit || "Limit not provided",
    },
    {
      key: "references",
      label: "References",
      limitText: guideline.reference_limit || "Not specified",
      status: computeComplianceStatus(hasManuscriptData ? referenceCount : null, referenceLimit),
      detail: referenceLimit
        ? hasManuscriptData && referenceCount !== null
          ? `${referenceCount} of ${referenceLimit}`
          : `${referenceLimit} references (limit)`
        : guideline.reference_limit || "Limit not provided",
    },
  ];
}

function renderJournalSummary() {
  if (!els.journalSummary) return;
  const container = els.journalSummary;
  container.innerHTML = "";

  if (!selectedGuideline) {
    container.classList.add("muted");
    container.innerHTML = "<p>No journal selected yet.</p>";
    if (els.exportMarkdown) els.exportMarkdown.disabled = true;
    return;
  }

  container.classList.remove("muted");
  if (els.exportMarkdown) els.exportMarkdown.disabled = false;
  const title = document.createElement("p");
  title.className = "journal-summary__title";
  title.textContent = `${selectedGuideline.journal} — ${selectedGuideline.article_type}`;
  container.appendChild(title);

  const constraints = buildConstraintSummaries(selectedGuideline);
  constraints.forEach((constraint) => {
    const row = document.createElement("div");
    row.className = "journal-summary__row";
    const label = document.createElement("span");
    label.textContent = constraint.label;
    row.appendChild(label);
    row.appendChild(createComplianceIndicator(constraint.status, constraint.detail));
    container.appendChild(row);
  });
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
  const sectionLimits = sectionLimitsFromGuideline(guideline);
  const expectedWordMap = buildExpectedWordMap(guideline, expectedCategories);

  for (const [category, limit] of Object.entries(sectionLimits)) {
    if (category === "Significance Statement") continue;
    const actual = byCategory[category] || 0;
    if (actual > limit) {
      changeList.push(`${category} ${actual}/${limit} words (reduce by ${actual - limit})`);
    }
  }

  const significanceLimit = sectionLimits["Significance Statement"];
  const significanceWords = byCategory["Significance Statement"] || 0;
  if (
    significanceLimit &&
    guideline.journal?.includes("Proceedings of the National Academy of Sciences") &&
    guideline.article_type === "Research Report"
  ) {
    if (!significanceWords) {
      changeList.push("Add a Significance Statement (required for PNAS Research Reports)");
    } else if (significanceWords > significanceLimit) {
      changeList.push(
        `Significance Statement ${significanceWords}/${significanceLimit} words (reduce by ${significanceWords - significanceLimit})`
      );
    }
  }

  const sectionDetails = expectedCategories.map((category) => {
    const actual = byCategory[category] || 0;
    const limit = sectionLimits[category] || null;
    const expected = limit ? null : expectedWordMap[category] || null;
    const ratio = limit
      ? (limit ? (actual / limit).toFixed(2) : "n/a")
      : expected
      ? (actual / expected).toFixed(2)
      : "n/a";
    return { category, actual, expected, ratio, limit };
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

  renderJournalSummary();

  if (!manuscriptSections.length) {
    container.classList.add("muted");
    container.innerHTML = "<p>Upload a manuscript to run journal checks.</p>";
    return;
  }

  const { changeList, sectionDetails } = evaluateAgainstGuideline(selectedGuideline);
  const constraints = buildConstraintSummaries(selectedGuideline);
  const card = document.createElement("div");
  card.className = "change-results";

  const title = document.createElement("h3");
  title.textContent = `${selectedGuideline.journal} — ${selectedGuideline.article_type}`;
  card.appendChild(title);

  const constraintHeading = document.createElement("h4");
  constraintHeading.textContent = "Key limits";
  card.appendChild(constraintHeading);

  const constraintGrid = document.createElement("div");
  constraintGrid.className = "constraint-grid";
  constraints.forEach((constraint) => {
    const tile = document.createElement("div");
    tile.className = "constraint-tile";
    const label = document.createElement("span");
    label.textContent = constraint.label;
    label.className = "constraint-title";
    const indicator = createComplianceIndicator(constraint.status, constraint.detail);
    const meta = document.createElement("div");
    meta.className = "constraint-tile__meta";
    meta.textContent = constraint.limitText;
    tile.appendChild(label);
    tile.appendChild(indicator);
    tile.appendChild(meta);
    constraintGrid.appendChild(tile);
  });
  card.appendChild(constraintGrid);

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
  const hasSectionLimits = sectionDetails.some((detail) => detail.limit);
  const ratioHeader = hasSectionLimits ? "Actual/Limit" : "Actual/Expected";
  const expectedHeader = hasSectionLimits ? "Expected words (estimate)" : "Expected words";
  table.innerHTML = `<thead><tr><th>Section</th><th>Actual words</th>${hasSectionLimits ? "<th>Limit status</th>" : ""}<th>${expectedHeader}</th><th>${ratioHeader}</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  sectionDetails.forEach((detail) => {
    const row = document.createElement("tr");
    const status = sectionLimitStatus(detail.actual, detail.limit);
    const limitCell = hasSectionLimits ? document.createElement("td") : null;
    const limitPlaceholder = hasSectionLimits ? '<td class="placeholder"></td>' : "";
    row.innerHTML = `<td>${detail.category}</td><td>${detail.actual}</td>${limitPlaceholder}<td>${detail.expected ?? "n/a"}</td><td>${detail.ratio}</td>`;
    if (hasSectionLimits && limitCell) {
      if (detail.limit) {
        limitCell.appendChild(createComplianceIndicator(computeComplianceStatus(detail.actual, detail.limit), status.label));
      } else {
        limitCell.textContent = "—";
      }
      row.children[2].replaceWith(limitCell);
    }
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  sectionTable.appendChild(table);
  card.appendChild(sectionTable);
  container.appendChild(card);
}

function generateChecklistMarkdown(
  guideline,
  { sections = manuscriptSections, totalWordsCount = totalWords, figureMentions = figureReferenceCount, figureUploads = figureFileCount } = {}
) {
  const lines = [];
  const constraintSummaries = buildConstraintSummaries(guideline, {
    sections,
    totalWordsCount,
    figureMentions,
    figureUploads,
  });
  const sectionLimits = sectionLimitsFromGuideline(guideline);
  const expectedCategories = expectedSectionsForGuideline(guideline);
  const byCategory = aggregateWordsByCategory(sections);
  const hasFigureData =
    (figureMentions !== null && figureMentions !== undefined) || (figureUploads !== null && figureUploads !== undefined);
  const figureActual = hasFigureData ? Math.max(figureMentions ?? 0, figureUploads ?? 0) : "n/a";

  lines.push(`# Journal checklist: ${guideline.journal} — ${guideline.article_type}`);
  lines.push("");
  lines.push(`- Total word count: ${totalWordsCount || "n/a"}`);
  lines.push(`- Figures mentioned/uploaded: ${figureActual}`);
  lines.push("");
  lines.push("## Section word counts");
  expectedCategories.forEach((category) => {
    const actual = byCategory[category] || 0;
    const limit = sectionLimits[category];
    const detail = limit ? ` (${actual}/${limit} words)` : "";
    lines.push(`- ${category}: ${actual}${detail}`);
  });

  lines.push("");
  lines.push("## Constraints");
  constraintSummaries.forEach((constraint) => {
    const statusLabel = constraint.status.label;
    lines.push(`- ${statusLabel}: ${constraint.label} — ${constraint.detail} (${constraint.limitText})`);
  });

  return lines.join("\n");
}

let exportResetHandle = null;

async function exportChecklistMarkdown() {
  if (!selectedGuideline) return;
  const markdown = generateChecklistMarkdown(selectedGuideline);
  const button = els.exportMarkdown;

  const resetLabel = () => {
    if (button) {
      button.textContent = "Export checklist as Markdown";
      button.disabled = false;
    }
  };

  const showSuccess = (label) => {
    if (!button) return;
    button.textContent = label;
    button.disabled = false;
    if (exportResetHandle) clearTimeout(exportResetHandle);
    exportResetHandle = setTimeout(resetLabel, 2000);
  };

  const triggerDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "journal-checklist.md";
    link.click();
    URL.revokeObjectURL(url);
    showSuccess("Downloaded");
  };

  try {
    if (button) button.disabled = true;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      showSuccess("Copied to clipboard");
    } else {
      triggerDownload();
    }
  } catch (err) {
    console.error("Unable to export markdown", err);
    triggerDownload();
  }
}

function populateJournalOptions() {
  if (!els.journalSelect) return;
  const query = normalizeSearchValue(els.journalFilter.value || "");
  const matchesQuery = (g) => normalizeSearchValue(`${g.journal} ${g.article_type}`).includes(query);
  const previousSelection = selectedGuideline;
  filteredGuidelines = guidelines.filter(matchesQuery);

  els.journalSelect.innerHTML = "";

  if (!filteredGuidelines.length) {
    const option = document.createElement("option");
    option.textContent = "No matches";
    option.disabled = true;
    option.selected = true;
    els.journalSelect.appendChild(option);
    selectedGuideline = null;
    renderJournalSummary();
    renderChangeResults();
    return;
  }

  const groups = new Map();
  filteredGuidelines.forEach((entry, idx) => {
    if (!groups.has(entry.journal)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = entry.journal;
      groups.set(entry.journal, optgroup);
    }
    const option = document.createElement("option");
    option.value = String(idx);
    option.dataset.indent = "true";
    option.textContent = entry.article_type;
    groups.get(entry.journal).appendChild(option);
  });

  groups.forEach((optgroup) => {
    els.journalSelect.appendChild(optgroup);
  });

  const retainedSelection = previousSelection && filteredGuidelines.includes(previousSelection)
    ? previousSelection
    : filteredGuidelines[0];
  selectedGuideline = retainedSelection;
  els.journalSelect.value = String(filteredGuidelines.indexOf(selectedGuideline));
  renderChangeResults();
  renderJournalSummary();
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

  const updateStatus = (message, progress) => {
    if (!els.manuscriptStatus) return;
    const suffix = typeof progress === "number" ? ` (${Math.round(progress * 100)}%)` : "";
    const label = message ? `${message} — ${file.name}` : `Processing ${file.name}`;
    els.manuscriptStatus.textContent = `${label}${suffix}`;
  };

  try {
    updateStatus("Starting analysis", 0);
    const parsed = await parseManuscriptFile(file, updateStatus);
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
    els.manuscriptStatus.textContent = err.message === "Parsing cancelled." ? `Parsing cancelled for ${file.name}.` : `Unable to read ${file.name}: ${err.message}`;
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
    renderChangeResults();
    return;
  }
  const names = files.map((f) => f.name).join(", ");
  els.figureStatus.textContent = `${files.length} file${files.length === 1 ? "" : "s"} uploaded: ${names}`;
  event.target.value = "";
  renderAnalysisSummary();
  renderChangeResults();
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

  if (els.exportMarkdown) {
    els.exportMarkdown.addEventListener("click", exportChecklistMarkdown);
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
