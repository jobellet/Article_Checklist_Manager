/** @typedef {import('./data/guideline-types.js').Guideline} Guideline */
import { loadGuidelines } from './data/guidelines-loader.js';
import {
  detectSections,
  findCategoriesInText,
} from './parsers/section-detector.js';
import { countWords, normalizeSearchValue } from './src/utils/text-utils.js';
import { TaskStore, habitDefaults } from './src/utils/task-store.js';
import { wireValidationStatus } from './validate/validation-status.js';

/** @type {Guideline[]} */
let guidelines = [];
/** @type {Guideline[]} */
let filteredGuidelines = [];
let manuscriptSections = [];
let totalWords = 0;
let figureReferenceCount = 0;
let figureFileCount = 0;
/** @type {Guideline | null} */
let selectedGuideline = null;
const taskStore = new TaskStore();
const TASK_STORAGE_KEY = taskStore.storageKey;
const defaultTaskUser = 'you';
let demoRoutine = null;
let routineVersion = 0;
let selectedTaskId = null;
let taskStoreLoadError = '';

const els = {
  manuscriptUpload: document.getElementById('manuscript-upload'),
  figureUpload: document.getElementById('figure-upload'),
  manuscriptStatus: document.getElementById('manuscript-status'),
  figureStatus: document.getElementById('figure-status'),
  journalFilter: document.getElementById('journal-filter'),
  journalSelect: document.getElementById('journal-select'),
  journalSummary: document.getElementById('journal-summary'),
  exportMarkdown: document.getElementById('export-markdown'),
  analysisSummary: document.getElementById('analysis-summary'),
  changeResults: document.getElementById('change-results'),
  todayList: document.getElementById('today-list'),
  plannerList: document.getElementById('planner-list'),
  plannerFeedback: document.getElementById('planner-feedback'),
  achievementList: document.getElementById('achievement-list'),
  rewardSummary: document.getElementById('reward-summary'),
  seedRoutines: document.getElementById('seed-routines'),
  deleteRoutines: document.getElementById('delete-routines'),
  addHabit: document.getElementById('add-habit'),
  refreshAchievements: document.getElementById('refresh-achievements'),
  taskStoreStatus: document.getElementById('taskstore-status'),
  exportTasks: document.getElementById('export-tasks'),
  importTasks: document.getElementById('import-tasks'),
  resetTaskData: document.getElementById('reset-task-data'),
  taskEditor: document.getElementById('task-editor'),
  taskEditorForm: document.getElementById('task-editor-form'),
  taskEditorClose: document.getElementById('task-editor-close'),
  taskEditorTitle: document.getElementById('task-editor-title'),
};

if (els.exportMarkdown) {
  els.exportMarkdown.disabled = true;
}

const manuscriptWorker =
  typeof Worker !== 'undefined'
    ? new Worker('parsers/manuscript.worker.js', { type: 'module' })
    : null;
const validationWorker =
  typeof Worker !== 'undefined'
    ? new Worker('validate/validate-guidelines.worker.js', { type: 'module' })
    : null;

wireValidationStatus(validationWorker);

function getLocalStorageSafe() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (err) {
    return null;
  }
}

function renderTaskStoreStatus(message, tone = 'info') {
  if (!els.taskStoreStatus) return;
  els.taskStoreStatus.textContent = message;
  els.taskStoreStatus.dataset.tone = tone;
  if (!message) {
    els.taskStoreStatus.setAttribute('aria-live', 'off');
  } else {
    els.taskStoreStatus.setAttribute('aria-live', 'polite');
  }
}

function persistTaskStore() {
  taskStore.saveToStorage(getLocalStorageSafe(), TASK_STORAGE_KEY);
}

function initializeTaskStoreFromStorage() {
  const result = taskStore.loadFromStorage(getLocalStorageSafe(), TASK_STORAGE_KEY);
  if (!result.ok) {
    taskStoreLoadError = result.message || 'Task data could not be loaded.';
    renderTaskStoreStatus(`${taskStoreLoadError} You can reset local data to continue.`, 'error');
  } else if (result.errors?.length) {
    renderTaskStoreStatus(result.errors[0], 'warning');
  }
}

function resetTaskData() {
  const storage = getLocalStorageSafe();
  if (storage) storage.removeItem(TASK_STORAGE_KEY);
  taskStore.reset();
  taskStoreLoadError = '';
  renderTaskStoreStatus('Local task data reset. Seed a routine to begin.', 'info');
  seedBaselineTasks();
  seedRoutineDemo();
  renderTaskSurfaces();
  persistTaskStore();
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
  if (!window.JSZip) throw new Error('JSZip is unavailable in this browser.');
  reportProgress('Reading .docx file', 0.05);
  const buffer = await file.arrayBuffer();
  reportProgress('Extracting document', 0.15);
  const zip = await window.JSZip.loadAsync(buffer);
  reportProgress('Parsing document XML', 0.25);
  const documentXml = await zip.file('word/document.xml').async('string');
  reportProgress('Analyzing document structure', 0.35);
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagName('w:p'));

  const sections = [];
  const textContent = [];
  const sectionStack = [];
  let preambleWords = 0;

  const getText = (p) =>
    Array.from(p.getElementsByTagName('w:t'))
      .map((t) => t.textContent)
      .join('')
      .trim();

  const headingLevel = (p) => {
    const style = Array.from(p.getElementsByTagName('w:pStyle')).find((s) =>
      s.getAttribute('w:val')?.startsWith('Heading'),
    );
    if (!style) return null;
    const match =
      style.getAttribute('w:val').match(/Heading\s*([0-9]+)/i) ||
      style.getAttribute('w:val').match(/Heading([0-9]+)/i);
    return match ? Number(match[1]) : 1;
  };

  const closeSections = (level) => {
    while (
      sectionStack.length &&
      sectionStack[sectionStack.length - 1].level >= level
    ) {
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
      sectionStack[sectionStack.length - 1].word_count += text
        .split(/\s+/)
        .filter(Boolean).length;
    } else {
      preambleWords += text.split(/\s+/).filter(Boolean).length;
    }

    if (idx % 25 === 0) {
      const progress = 0.35 + (idx / (paragraphs.length || 1)) * 0.55;
      reportProgress('Analyzing document structure', Math.min(progress, 0.9));
    }
  }

  closeSections(0);

  if (!sections.length && preambleWords) {
    sections.push({ title: file.name, word_count: preambleWords });
  }

  reportProgress('Finishing analysis', 0.95);
  const categorized = detectSections(
    sections.length ? sections : [{ title: file.name, word_count: 0 }],
  );
  return { sections: categorized, textContent: textContent.join('\n') };
}

async function parsePlainTextFile(file, onProgress = () => {}) {
  const reportProgress = onProgress || (() => {});
  reportProgress('Reading text file', 0.1);
  const text = await file.text();
  const words = countWords(text);
  reportProgress('Finishing analysis', 0.95);
  return {
    sections: detectSections([{ title: file.name, word_count: words }]),
    textContent: text,
  };
}

async function parseMarkdownFile(file, onProgress = () => {}) {
  const reportProgress = onProgress || (() => {});
  reportProgress('Reading markdown', 0.1);
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const sections = [];
  const sectionStack = [];
  let buffer = [];
  let preambleWords = 0;

  const flushTextToCurrent = () => {
    if (!buffer.length) return;
    const content = buffer.join(' ').trim();
    if (!content) return;
    if (!sectionStack.length) {
      preambleWords += countWords(content);
    } else {
      sectionStack[sectionStack.length - 1].word_count += countWords(content);
    }
    buffer = [];
  };

  const closeSections = (level) => {
    while (
      sectionStack.length &&
      sectionStack[sectionStack.length - 1].level >= level
    ) {
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
      reportProgress('Scanning markdown headings', Math.min(progress, 0.9));
    }
  });

  flushTextToCurrent();
  closeSections(0);

  reportProgress('Finishing analysis', 0.95);

  if (!sections.length && preambleWords) {
    return {
      sections: detectSections([
        { title: file.name, word_count: preambleWords },
      ]),
      textContent: text,
    };
  }

  const categorized = detectSections(
    sections.length ? sections : [{ title: file.name, word_count: 0 }],
  );
  return { sections: categorized, textContent: text };
}

async function parseManuscriptFileLocally(file, onProgress) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'docx':
      return parseDocxFile(file, onProgress);
    case 'txt':
      return parsePlainTextFile(file, onProgress);
    case 'md':
    case 'markdown':
      return parseMarkdownFile(file, onProgress);
    default:
      throw new Error(
        `Unsupported file type: .${ext}. Upload .docx, .txt, or .md/.markdown files.`,
      );
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
      const {
        type,
        data,
        error,
        message,
        progress,
        requestId: incomingId,
      } = event.data || {};
      if (incomingId !== requestId) return;
      if (type === 'manuscript:parsed') {
        cleanup();
        resolve(data);
      } else if (type === 'manuscript:error') {
        cleanup();
        reject(new Error(error || 'Unable to parse manuscript.'));
      } else if (type === 'manuscript:progress') {
        progressCallback(message, progress);
      } else if (type === 'manuscript:cancelled') {
        cleanup();
        reject(new Error('Parsing cancelled.'));
      }
    };

    const handleError = (err) => {
      cleanup();
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to parse manuscript in worker.';
      reject(new Error(message));
    };

    const cleanup = () => {
      manuscriptWorker.removeEventListener('message', handleMessage);
      manuscriptWorker.removeEventListener('error', handleError);
    };

    manuscriptWorker.addEventListener('message', handleMessage);
    manuscriptWorker.addEventListener('error', handleError);
    manuscriptWorker.postMessage({ type: 'cancel' });
    manuscriptWorker.postMessage({ type: 'parse', file, requestId });
  }).catch((err) => {
    if (err?.message === 'Parsing cancelled.') {
      return Promise.reject(err);
    }
    return parseManuscriptFileLocally(file, progressCallback).catch(
      (localErr) => Promise.reject(localErr || err),
    );
  });
}

function renderAnalysisSummary() {
  if (!els.analysisSummary) return;
  const summary = els.analysisSummary;
  summary.innerHTML = '';

  if (!manuscriptSections.length) {
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent =
      'Upload a supported manuscript file (.docx, .txt, .md) to extract sections and word counts.';
    summary.appendChild(hint);
    return;
  }

  const stats = document.createElement('div');
  stats.className = 'grid grid--two';

  const sectionsStat = document.createElement('div');
  sectionsStat.innerHTML = `<p class="muted">Detected sections</p><p class="percent">${manuscriptSections.length}</p>`;

  const wordStat = document.createElement('div');
  wordStat.innerHTML = `<p class="muted">Total words</p><p class="percent">${totalWords}</p>`;

  stats.appendChild(sectionsStat);
  stats.appendChild(wordStat);
  if (figureReferenceCount || figureFileCount) {
    const figureStat = document.createElement('div');
    const mentionsLabel = figureReferenceCount
      ? `${figureReferenceCount} mentioned`
      : 'No mentions';
    figureStat.innerHTML = `<p class="muted">Figures</p><p class="percent">${mentionsLabel}${figureFileCount ? ` · ${figureFileCount} uploaded` : ' (uploads optional)'}</p>`;
    stats.appendChild(figureStat);
  }
  summary.appendChild(stats);

  const pills = document.createElement('div');
  pills.className = 'actions';
  const categories = new Set(
    manuscriptSections.map((s) => s.category).filter((c) => c && c !== 'Other'),
  );
  if (!categories.size) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = 'No categorized sections detected';
    pills.appendChild(pill);
  } else {
    categories.forEach((category) => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = category;
      pills.appendChild(pill);
    });
  }
  summary.appendChild(pills);

  const figureNote = document.createElement('p');
  figureNote.className = 'muted';
  if (figureReferenceCount) {
    figureNote.textContent = `${figureReferenceCount} figure reference${figureReferenceCount === 1 ? '' : 's'} detected via "Figure n" labels.`;
  } else {
    figureNote.textContent = 'No figure references detected in the manuscript.';
  }
  summary.appendChild(figureNote);
}

function parseNumericLimit(limit) {
  if (!limit) return null;
  const normalized = limit.toString().toLowerCase();
  const parseNumber = (value) => Number(String(value).replace(/,/g, ''));

  const rangeMatches = [
    ...normalized.matchAll(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)/g),
  ].flatMap((m) => [m[1], m[2]]);
  const withUnits = [
    ...normalized.matchAll(
      /(\d[\d,]*)\s*(?:word|words|reference|references|figure|figures|table|tables|item|items)/g,
    ),
  ].map((m) => m[1]);
  const allNumbers = [...normalized.matchAll(/(\d[\d,]*)/g)].map((m) => m[1]);
  const candidates = [...rangeMatches, ...withUnits, ...allNumbers]
    .map((num) => parseNumber(num))
    .filter(Boolean);
  if (candidates.length) {
    return Math.max(...candidates);
  }
  return null;
}

function parseWordLimit(limit) {
  return parseNumericLimit(limit);
}

function computeComplianceStatus(actual, limit) {
  const parsedLimit =
    typeof limit === 'number' ? limit : parseNumericLimit(limit);
  if (!parsedLimit)
    return { status: 'na', label: 'No stated limit', limit: null, actual };
  if (actual === null || actual === undefined)
    return {
      status: 'na',
      label: 'No manuscript data',
      limit: parsedLimit,
      actual,
    };
  const ratio = parsedLimit ? actual / parsedLimit : 0;
  if (ratio > 1)
    return { status: 'over', label: 'Over limit', limit: parsedLimit, actual };
  if (ratio >= 0.9)
    return {
      status: 'warning',
      label: 'Close to limit',
      limit: parsedLimit,
      actual,
    };
  return { status: 'ok', label: 'Under limit', limit: parsedLimit, actual };
}

function createComplianceIndicator(status, detailText) {
  const indicator = document.createElement('span');
  indicator.className = `compliance-indicator compliance-indicator--${status.status}`;
  const glyph = document.createElement('span');
  glyph.className = `status-glyph status-glyph--${status.status}`;
  glyph.setAttribute('aria-hidden', 'true');
  const srLabel = document.createElement('span');
  srLabel.className = 'sr-only';
  srLabel.textContent = status.label;
  const text = document.createElement('span');
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

/**
 * Determine expected section categories for a guideline.
 * @param {Guideline} guideline
 * @returns {string[]}
 */
function expectedSectionsForGuideline(guideline) {
  const detected = requiredCategories(guideline.structure);
  if (detected.size) return [...detected];
  return [
    'Abstract',
    'Introduction',
    'Methods',
    'Results',
    'Discussion',
    'Conclusion',
  ].filter(Boolean);
}

function aggregateWordsByCategory(sections) {
  return sections.reduce((acc, section) => {
    const key = section.category || 'Other';
    acc[key] = (acc[key] || 0) + section.word_count;
    return acc;
  }, {});
}

function sectionLimitStatus(actual, limit) {
  const status = computeComplianceStatus(actual, limit);
  if (!status.limit) return { status: status.status, label: '—' };
  return { status: status.status, label: `${actual} / ${status.limit} words` };
}

/**
 * Evenly distribute word counts across expected categories when a limit exists.
 * @param {Guideline} guideline
 * @param {string[]} expectedCategories
 * @returns {Record<string, number>}
 */
function buildExpectedWordMap(guideline, expectedCategories) {
  const limit = parseWordLimit(guideline.word_limit);
  if (!limit || !expectedCategories.length) return {};
  const perSection = Math.round(limit / expectedCategories.length);
  return expectedCategories.reduce(
    (acc, cat) => ({ ...acc, [cat]: perSection }),
    {},
  );
}

const SECTION_LIMIT_KEYS = {
  abstract_limit: 'Abstract',
  introduction_limit: 'Introduction',
  methods_limit: 'Methods',
  results_limit: 'Results',
  discussion_limit: 'Discussion',
  conclusion_limit: 'Conclusion',
  significance_statement_limit: 'Significance Statement',
};

/**
 * Build a map of section-specific word limits from a guideline.
 * @param {Guideline} guideline
 * @returns {Record<string, number>}
 */
function sectionLimitsFromGuideline(guideline) {
  return Object.entries(SECTION_LIMIT_KEYS).reduce((acc, [key, category]) => {
    const parsed = parseWordLimit(guideline[key]);
    if (parsed) acc[category] = parsed;
    return acc;
  }, {});
}

/**
 * Summarize manuscript compliance against guideline constraints.
 * @param {Guideline} guideline
 * @param {{
 *   sections?: { title: string; word_count: number; category?: string | undefined }[],
 *   totalWordsCount?: number,
 *   figureMentions?: number | null,
 *   figureUploads?: number | null,
 *   referenceCount?: number | null,
 * }} [data]
 * @returns {Array<{ key: string; label: string; limitText: string; status: { status: string; label: string; limit: number | null; actual: number | null }; detail: string }>}
 */
function buildConstraintSummaries(
  guideline,
  {
    sections = manuscriptSections,
    totalWordsCount = totalWords,
    figureMentions = figureReferenceCount,
    figureUploads = figureFileCount,
    referenceCount = null,
  } = {},
) {
  const hasManuscriptData = Array.isArray(sections) && sections.length > 0;
  const hasFigureData =
    (figureMentions !== null && figureMentions !== undefined) ||
    (figureUploads !== null && figureUploads !== undefined);
  const figureActual = hasFigureData
    ? Math.max(figureMentions ?? 0, figureUploads ?? 0)
    : null;
  const wordLimit = parseWordLimit(guideline.word_limit);
  const figureLimit = parseNumericLimit(guideline.figure_limit);
  const referenceLimit = parseNumericLimit(guideline.reference_limit);

  return [
    {
      key: 'words',
      label: 'Main text',
      limitText: guideline.word_limit || 'Not specified',
      status: computeComplianceStatus(
        hasManuscriptData ? totalWordsCount : null,
        wordLimit,
      ),
      detail: wordLimit
        ? hasManuscriptData
          ? `${totalWordsCount || 0} / ${wordLimit} words`
          : `${wordLimit} words (limit)`
        : guideline.word_limit || 'Limit not provided',
    },
    {
      key: 'figures',
      label: 'Figures/Tables',
      limitText: guideline.figure_limit || 'Not specified',
      status: computeComplianceStatus(
        hasManuscriptData ? figureActual : null,
        figureLimit,
      ),
      detail: figureLimit
        ? hasManuscriptData && figureActual !== null
          ? `${figureActual} of ${figureLimit} items`
          : `${figureLimit} items (limit)`
        : guideline.figure_limit || 'Limit not provided',
    },
    {
      key: 'references',
      label: 'References',
      limitText: guideline.reference_limit || 'Not specified',
      status: computeComplianceStatus(
        hasManuscriptData ? referenceCount : null,
        referenceLimit,
      ),
      detail: referenceLimit
        ? hasManuscriptData && referenceCount !== null
          ? `${referenceCount} of ${referenceLimit}`
          : `${referenceLimit} references (limit)`
        : guideline.reference_limit || 'Limit not provided',
    },
  ];
}

function renderJournalSummary() {
  if (!els.journalSummary) return;
  const container = els.journalSummary;
  container.innerHTML = '';

  if (!selectedGuideline) {
    container.classList.add('muted');
    container.innerHTML = '<p>No journal selected yet.</p>';
    if (els.exportMarkdown) els.exportMarkdown.disabled = true;
    return;
  }

  container.classList.remove('muted');
  if (els.exportMarkdown) els.exportMarkdown.disabled = false;
  const title = document.createElement('p');
  title.className = 'journal-summary__title';
  title.textContent = `${selectedGuideline.journal} — ${selectedGuideline.article_type}`;
  container.appendChild(title);

  const constraints = buildConstraintSummaries(selectedGuideline);
  constraints.forEach((constraint) => {
    const row = document.createElement('div');
    row.className = 'journal-summary__row';
    const label = document.createElement('span');
    label.textContent = constraint.label;
    row.appendChild(label);
    row.appendChild(
      createComplianceIndicator(constraint.status, constraint.detail),
    );
    container.appendChild(row);
  });
}

function evaluateAgainstGuideline(guideline) {
  const changeList = [];
  const expectedCategories = expectedSectionsForGuideline(guideline);
  const manuscriptCats = new Set(
    manuscriptSections.map((s) => s.category).filter((c) => c !== 'Other'),
  );
  const missing = expectedCategories
    .filter((cat) => !manuscriptCats.has(cat))
    .sort();
  if (missing.length) {
    changeList.push(`Add sections covering: ${missing.join(', ')}`);
  }

  const limit = parseWordLimit(guideline.word_limit);
  if (limit && totalWords > limit) {
    changeList.push(
      `Total word count ${totalWords} exceeds ${limit} limit by ${totalWords - limit} words`,
    );
  }

  const abstractLimit = parseWordLimit(guideline.abstract_limit);
  if (abstractLimit) {
    const abstractSection = manuscriptSections.find(
      (s) => s.category === 'Abstract',
    );
    if (abstractSection && abstractSection.word_count > abstractLimit) {
      changeList.push(
        `Abstract ${abstractSection.word_count}/${abstractLimit} words (reduce by ${abstractSection.word_count - abstractLimit})`,
      );
    }
  }

  const byCategory = aggregateWordsByCategory(manuscriptSections);
  const sectionLimits = sectionLimitsFromGuideline(guideline);
  const expectedWordMap = buildExpectedWordMap(guideline, expectedCategories);

  for (const [category, limit] of Object.entries(sectionLimits)) {
    if (category === 'Significance Statement') continue;
    const actual = byCategory[category] || 0;
    if (actual > limit) {
      changeList.push(
        `${category} ${actual}/${limit} words (reduce by ${actual - limit})`,
      );
    }
  }

  const significanceLimit = sectionLimits['Significance Statement'];
  const significanceWords = byCategory['Significance Statement'] || 0;
  if (
    significanceLimit &&
    guideline.journal?.includes(
      'Proceedings of the National Academy of Sciences',
    ) &&
    guideline.article_type === 'Research Report'
  ) {
    if (!significanceWords) {
      changeList.push(
        'Add a Significance Statement (required for PNAS Research Reports)',
      );
    } else if (significanceWords > significanceLimit) {
      changeList.push(
        `Significance Statement ${significanceWords}/${significanceLimit} words (reduce by ${significanceWords - significanceLimit})`,
      );
    }
  }

  const sectionDetails = expectedCategories.map((category) => {
    const actual = byCategory[category] || 0;
    const limit = sectionLimits[category] || null;
    const expected = limit ? null : expectedWordMap[category] || null;
    const ratio = limit
      ? limit
        ? (actual / limit).toFixed(2)
        : 'n/a'
      : expected
        ? (actual / expected).toFixed(2)
        : 'n/a';
    return { category, actual, expected, ratio, limit };
  });

  return { changeList, sectionDetails };
}

function renderChangeResults() {
  if (!els.changeResults) return;
  const container = els.changeResults;
  container.classList.remove('muted');
  container.innerHTML = '';

  if (!selectedGuideline) {
    container.classList.add('muted');
    container.innerHTML = '<p>Loading journal options…</p>';
    return;
  }

  renderJournalSummary();

  if (!manuscriptSections.length) {
    container.classList.add('muted');
    container.innerHTML = '<p>Upload a manuscript to run journal checks.</p>';
    return;
  }

  const { changeList, sectionDetails } =
    evaluateAgainstGuideline(selectedGuideline);
  const constraints = buildConstraintSummaries(selectedGuideline);
  const card = document.createElement('div');
  card.className = 'change-results';

  const title = document.createElement('h3');
  title.textContent = `${selectedGuideline.journal} — ${selectedGuideline.article_type}`;
  card.appendChild(title);

  const constraintHeading = document.createElement('h4');
  constraintHeading.textContent = 'Key limits';
  card.appendChild(constraintHeading);

  const constraintGrid = document.createElement('div');
  constraintGrid.className = 'constraint-grid';
  constraints.forEach((constraint) => {
    const tile = document.createElement('div');
    tile.className = 'constraint-tile';
    const label = document.createElement('span');
    label.textContent = constraint.label;
    label.className = 'constraint-title';
    const indicator = createComplianceIndicator(
      constraint.status,
      constraint.detail,
    );
    const meta = document.createElement('div');
    meta.className = 'constraint-tile__meta';
    meta.textContent = constraint.limitText;
    tile.appendChild(label);
    tile.appendChild(indicator);
    tile.appendChild(meta);
    constraintGrid.appendChild(tile);
  });
  card.appendChild(constraintGrid);

  if (!changeList.length) {
    const para = document.createElement('p');
    para.textContent =
      'No required changes detected. This manuscript fits the selected journal limits.';
    card.appendChild(para);
    container.appendChild(card);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'change-results__list';
  changeList.forEach((change) => {
    const li = document.createElement('li');
    li.textContent = change;
    list.appendChild(li);
  });

  card.appendChild(list);

  const sectionTable = document.createElement('div');
  sectionTable.className = 'section-ratios';
  const heading = document.createElement('h4');
  heading.textContent = 'Expected sections';
  sectionTable.appendChild(heading);

  const table = document.createElement('table');
  const hasSectionLimits = sectionDetails.some((detail) => detail.limit);
  const ratioHeader = hasSectionLimits ? 'Actual/Limit' : 'Actual/Expected';
  const expectedHeader = hasSectionLimits
    ? 'Expected words (estimate)'
    : 'Expected words';
  table.innerHTML = `<thead><tr><th>Section</th><th>Actual words</th>${hasSectionLimits ? '<th>Limit status</th>' : ''}<th>${expectedHeader}</th><th>${ratioHeader}</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  sectionDetails.forEach((detail) => {
    const row = document.createElement('tr');
    const status = sectionLimitStatus(detail.actual, detail.limit);
    const limitCell = hasSectionLimits ? document.createElement('td') : null;
    const limitPlaceholder = hasSectionLimits
      ? '<td class="placeholder"></td>'
      : '';
    row.innerHTML = `<td>${detail.category}</td><td>${detail.actual}</td>${limitPlaceholder}<td>${detail.expected ?? 'n/a'}</td><td>${detail.ratio}</td>`;
    if (hasSectionLimits && limitCell) {
      if (detail.limit) {
        limitCell.appendChild(
          createComplianceIndicator(
            computeComplianceStatus(detail.actual, detail.limit),
            status.label,
          ),
        );
      } else {
        limitCell.textContent = '—';
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
  {
    sections = manuscriptSections,
    totalWordsCount = totalWords,
    figureMentions = figureReferenceCount,
    figureUploads = figureFileCount,
  } = {},
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
    (figureMentions !== null && figureMentions !== undefined) ||
    (figureUploads !== null && figureUploads !== undefined);
  const figureActual = hasFigureData
    ? Math.max(figureMentions ?? 0, figureUploads ?? 0)
    : 'n/a';

  lines.push(
    `# Journal checklist: ${guideline.journal} — ${guideline.article_type}`,
  );
  lines.push('');
  lines.push(`- Total word count: ${totalWordsCount || 'n/a'}`);
  lines.push(`- Figures mentioned/uploaded: ${figureActual}`);
  lines.push('');
  lines.push('## Section word counts');
  expectedCategories.forEach((category) => {
    const actual = byCategory[category] || 0;
    const limit = sectionLimits[category];
    const detail = limit ? ` (${actual}/${limit} words)` : '';
    lines.push(`- ${category}: ${actual}${detail}`);
  });

  lines.push('');
  lines.push('## Constraints');
  constraintSummaries.forEach((constraint) => {
    const statusLabel = constraint.status.label;
    lines.push(
      `- ${statusLabel}: ${constraint.label} — ${constraint.detail} (${constraint.limitText})`,
    );
  });

  return lines.join('\n');
}

let exportResetHandle = null;

async function exportChecklistMarkdown() {
  if (!selectedGuideline) return;
  const markdown = generateChecklistMarkdown(selectedGuideline);
  const button = els.exportMarkdown;

  const resetLabel = () => {
    if (button) {
      button.textContent = 'Export checklist as Markdown';
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
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'journal-checklist.md';
    link.click();
    URL.revokeObjectURL(url);
    showSuccess('Downloaded');
  };

  try {
    if (button) button.disabled = true;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      showSuccess('Copied to clipboard');
    } else {
      triggerDownload();
    }
  } catch (err) {
    console.error('Unable to export markdown', err);
    triggerDownload();
  }
}

function populateJournalOptions() {
  if (!els.journalSelect) return;
  const query = normalizeSearchValue(els.journalFilter.value || '');
  const matchesQuery = (g) =>
    normalizeSearchValue(`${g.journal} ${g.article_type}`).includes(query);
  const previousSelection = selectedGuideline;
  filteredGuidelines = guidelines.filter(matchesQuery);

  els.journalSelect.innerHTML = '';

  if (!filteredGuidelines.length) {
    const option = document.createElement('option');
    option.textContent = 'No matches';
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
      const optgroup = document.createElement('optgroup');
      optgroup.label = entry.journal;
      groups.set(entry.journal, optgroup);
    }
    const option = document.createElement('option');
    option.value = String(idx);
    option.dataset.indent = 'true';
    option.textContent = entry.article_type;
    groups.get(entry.journal).appendChild(option);
  });

  groups.forEach((optgroup) => {
    els.journalSelect.appendChild(optgroup);
  });

  const retainedSelection =
    previousSelection && filteredGuidelines.includes(previousSelection)
      ? previousSelection
      : filteredGuidelines[0];
  selectedGuideline = retainedSelection;
  els.journalSelect.value = String(
    filteredGuidelines.indexOf(selectedGuideline),
  );
  renderChangeResults();
  renderJournalSummary();
}

async function initializeGuidelines() {
  try {
    guidelines = await loadGuidelines();
    populateJournalOptions();
  } catch (err) {
    console.error('Failed to load guidelines', err);
    if (els.changeResults) {
      els.changeResults.innerHTML =
        "<p class='muted'>Unable to load journal guidelines.</p>";
    }
  }
}

async function handleManuscriptUpload(event) {
  const [file] = event.target.files;
  if (!file) return;

  const updateStatus = (message, progress) => {
    if (!els.manuscriptStatus) return;
    const suffix =
      typeof progress === 'number' ? ` (${Math.round(progress * 100)}%)` : '';
    const label = message
      ? `${message} — ${file.name}`
      : `Processing ${file.name}`;
    els.manuscriptStatus.textContent = `${label}${suffix}`;
  };

  try {
    updateStatus('Starting analysis', 0);
    const parsed = await parseManuscriptFile(file, updateStatus);
    manuscriptSections = parsed.sections;
    totalWords = manuscriptSections.reduce(
      (acc, section) => acc + section.word_count,
      0,
    );
    figureReferenceCount = countFigureMentionsFromText(parsed.textContent);
    els.manuscriptStatus.textContent = `${file.name} uploaded and analyzed.`;
    renderAnalysisSummary();
    renderChangeResults();
  } catch (err) {
    manuscriptSections = [];
    totalWords = 0;
    figureReferenceCount = 0;
    els.manuscriptStatus.textContent =
      err.message === 'Parsing cancelled.'
        ? `Parsing cancelled for ${file.name}.`
        : `Unable to read ${file.name}: ${err.message}`;
    renderAnalysisSummary();
    renderChangeResults();
  }

  event.target.value = '';
}

function handleFigureUpload(event) {
  const files = Array.from(event.target.files || []);
  figureFileCount = files.length;
  if (!files.length) {
    els.figureStatus.textContent = 'Figures optional; no uploads yet.';
    event.target.value = '';
    renderAnalysisSummary();
    renderChangeResults();
    return;
  }
  const names = files.map((f) => f.name).join(', ');
  els.figureStatus.textContent = `${files.length} file${files.length === 1 ? '' : 's'} uploaded: ${names}`;
  event.target.value = '';
  renderAnalysisSummary();
  renderChangeResults();
}

// -----------------------------
// TaskStore wiring (Today/Planner/Achievements/Rewards)
// -----------------------------

function seedBaselineTasks() {
  if (!taskStore.tasks.size) {
    taskStore.addTask({
      user: defaultTaskUser,
      name: 'Draft discussion section',
      durationMinutes: 45,
      importance: 4,
      urgency: 3,
      deadline: new Date().toISOString().slice(0, 10),
    });
    taskStore.addTask({
      user: defaultTaskUser,
      name: 'Collect reviewer figures',
      durationMinutes: 20,
      importance: 3,
      urgency: 2,
      fixFlex: 'FIX',
    });
    persistTaskStore();
  }
}

function seedRoutineDemo() {
  const steps =
    routineVersion % 2 === 0
      ? [
          {
            id: 'prep',
            label: 'Routine: outline daily plan',
            durationMinutes: 10,
            importance: 3,
            fixFlex: 'FIX',
          },
          {
            id: 'write',
            label: 'Routine: write 500 words',
            durationMinutes: 30,
            importance: 4,
            dependency: null,
          },
          {
            id: 'sync',
            label: 'Routine: share summary',
            durationMinutes: 10,
            dependency: null,
          },
        ]
      : [
          {
            id: 'prep',
            label: 'Routine: outline sprint goals',
            durationMinutes: 12,
            importance: 4,
            fixFlex: 'FIX',
          },
          {
            id: 'write',
            label: 'Routine: edit figures',
            durationMinutes: 25,
            importance: 3,
            dependency: null,
          },
        ];

  if (!demoRoutine) {
    demoRoutine = taskStore.createRoutine({
      id: 'demo-routine',
      user: defaultTaskUser,
      steps,
    });
  } else {
    taskStore.updateRoutine(demoRoutine.id, { steps });
  }
  routineVersion += 1;
  renderTaskSurfaces();
  persistTaskStore();
}

function deleteRoutineDemo() {
  if (demoRoutine) {
    taskStore.deleteRoutine(demoRoutine.id, { keepTaskHistory: true });
    renderTaskSurfaces();
    persistTaskStore();
  }
}

function ingestHabitDemo() {
  const sampleName = `Stretch ${(taskStore.durationProfiles.size % 3) + 1}`;
  taskStore.ingestHabitCompletion({
    name: sampleName,
    user: defaultTaskUser,
    durationMinutes: habitDefaults.durationMinutes,
    importance: habitDefaults.importance,
  });
  renderTaskSurfaces();
  persistTaskStore();
}

function completeTask(taskId, { actualDurationMinutes, scheduledDurationMinutes } = {}) {
  taskStore.markTaskComplete(taskId, { actualDurationMinutes, scheduledDurationMinutes });
  renderTaskSurfaces();
  persistTaskStore();
}

function startFocusSession(taskId) {
  const task = taskStore.tasks.get(taskId);
  const observed = task?.durationMinutes || undefined;
  taskStore.completeFocusSession(taskId, { actualDurationMinutes: observed });
  renderTaskSurfaces();
  persistTaskStore();
}

function openTaskEditor(task) {
  if (!els.taskEditor || !els.taskEditorForm) return;
  selectedTaskId = task.id;
  els.taskEditorTitle.textContent = `Edit ${task.name}`;
  const form = els.taskEditorForm;
  form.name.value = task.name;
  form.user.value = task.user;
  form.durationMinutes.value = task.durationMinutes;
  form.importance.value = task.importance ?? '';
  form.urgency.value = task.urgency ?? '';
  form.deadline.value = task.deadline ? task.deadline.split('T')[0] : '';
  form.dependency.value = task.dependency ?? '';
  form.fixFlex.value = task.fixFlex ?? 'FLEX';
  els.taskEditor.showModal();
}

function renderBadges(task) {
  const pillContainer = document.createElement('div');
  pillContainer.className = 'task__controls';

  if (task.fixFlex === 'FIX') {
    const pill = document.createElement('span');
    pill.className = 'pill pill--fix';
    pill.textContent = 'FIXed';
    pillContainer.appendChild(pill);
  }

  if (task.type === 'habit') {
    const pill = document.createElement('span');
    pill.className = 'pill pill--habit';
    pill.textContent = 'Habit';
    pillContainer.appendChild(pill);
  }

  if (task.routineId) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = 'Routine step';
    pillContainer.appendChild(pill);
  }

  if (task.dependency) {
    const dependency = taskStore.tasks.get(task.dependency);
    const blocked = dependency && !dependency.completed;
    const pill = document.createElement('span');
    pill.className = `pill ${blocked ? 'pill--blocked' : ''}`;
    pill.textContent = blocked
      ? `Blocked by ${dependency?.name || 'task'}`
      : `Follows ${dependency?.name || 'dependency'}`;
    pillContainer.appendChild(pill);
  }

  return pillContainer;
}

function renderTask(task, context = 'today') {
  const card = document.createElement('article');
  card.className = 'task';
  card.dataset.taskId = task.id;

  const header = document.createElement('div');
  header.className = 'task__header';
  const title = document.createElement('div');
  title.className = 'task__title';
  title.textContent = task.name;
  header.appendChild(title);
  header.appendChild(renderBadges(task));
  card.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'task__controls';
  const duration = document.createElement('span');
  duration.className = 'pill';
  duration.textContent = `${task.durationMinutes}m`;
  meta.appendChild(duration);
  if (task.deadline) {
    const deadline = document.createElement('span');
    deadline.className = 'pill';
    deadline.textContent = `Due ${task.deadline}`;
    meta.appendChild(deadline);
  }
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'task__actions';
  const doneBtn = document.createElement('button');
  doneBtn.textContent = task.completed ? 'Completed' : 'Mark done';
  doneBtn.disabled = !!task.completed;
  doneBtn.addEventListener('click', () => completeTask(task.id));
  actions.appendChild(doneBtn);

  const focusBtn = document.createElement('button');
  focusBtn.textContent = 'Start focus';
  focusBtn.disabled = !!task.completed;
  focusBtn.addEventListener('click', () => startFocusSession(task.id));
  actions.appendChild(focusBtn);

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openTaskEditor(task));
  actions.appendChild(editBtn);

  if (context === 'planner') {
    const rescheduleBtn = document.createElement('button');
    rescheduleBtn.textContent = 'Reschedule';
    rescheduleBtn.disabled = !!task.completed;
    rescheduleBtn.addEventListener('click', () => handleReschedule(task));
    actions.appendChild(rescheduleBtn);
  }

  card.appendChild(actions);
  return card;
}

function renderTaskCollection(targetEl, tasks, context) {
  if (!targetEl) return;
  targetEl.innerHTML = '';
  targetEl.classList.remove('muted');
  if (!tasks.length) {
    targetEl.classList.add('muted');
    targetEl.textContent = 'No tasks available yet.';
    return;
  }
  tasks.forEach((task) => targetEl.appendChild(renderTask(task, context)));
}

function renderTodayList() {
  const tasks = taskStore
    .getTasksForUser(defaultTaskUser)
    .filter((task) => task.active && !task.completed);
  renderTaskCollection(els.todayList, tasks, 'today');
}

function handleReschedule(task) {
  if (!els.plannerFeedback) return;
  const result = taskStore.rescheduleTask(task.id, {
    newDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    dependencyCascade: task.dependency ? confirm('Reschedule dependency too?') : false,
  });
  if (result?.blocked) {
    els.plannerFeedback.textContent = 'Reschedule blocked by dependency. Enable cascade to continue.';
  } else {
    els.plannerFeedback.textContent = `Rescheduled ${task.name} to ${result.task.deadline}.`;
  }
  renderPlannerList();
  persistTaskStore();
}

function renderPlannerList() {
  const tasks = taskStore
    .getTasksForUser(defaultTaskUser, { includeInactive: false })
    .filter((task) => task.active);
  renderTaskCollection(els.plannerList, tasks, 'planner');
}

function renderAchievements() {
  if (!els.achievementList) return;
  const tasks = Array.from(taskStore.tasks.values()).filter((task) => task.type === 'habit');
  if (!tasks.length) {
    els.achievementList.classList.add('muted');
    els.achievementList.textContent = 'No completions yet.';
    return;
  }
  els.achievementList.classList.remove('muted');
  els.achievementList.innerHTML = '';
  const byCategory = tasks.reduce((acc, task) => {
    const category = task.name.replace(/^Habit:\s*/, 'Habit: ');
    acc[category] = acc[category] || { total: 0, recent: 0 };
    acc[category].total += 1;
    if (task.completedAt && Date.now() - Date.parse(task.completedAt) < 7 * 24 * 60 * 60 * 1000) {
      acc[category].recent += 1;
    }
    return acc;
  }, {});

  Object.entries(byCategory).forEach(([category, stats]) => {
    const item = document.createElement('div');
    item.className = 'task';
    item.innerHTML = `<div class="task__header"><div class="task__title">${category}</div><span class="pill pill--habit">Habit</span></div>`;
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${stats.total} total completions · ${stats.recent} this week`;
    item.appendChild(meta);
    els.achievementList.appendChild(item);
  });
}

function renderRewards() {
  if (!els.rewardSummary) return;
  const completed = Array.from(taskStore.tasks.values()).filter((task) => task.completed);
  if (!completed.length) {
    els.rewardSummary.classList.add('muted');
    els.rewardSummary.textContent = 'No activity recorded.';
    return;
  }
  const today = completed.filter((task) =>
    task.completedAt && new Date(task.completedAt).toDateString() === new Date().toDateString(),
  );
  const bonus = completed.filter((task) => task.importance >= 4).length;
  const spent = completed.filter((task) => task.type === 'habit').length;
  els.rewardSummary.classList.remove('muted');
  els.rewardSummary.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'task';
  summary.innerHTML = `<div class="task__header"><div class="task__title">Ledger</div></div>`;
  const stats = document.createElement('p');
  stats.className = 'muted';
  stats.textContent = `${today.length} completed today · ${bonus} bonus-worthy · ${spent} habit redemptions`;
  summary.appendChild(stats);
  els.rewardSummary.appendChild(summary);
}

function renderTaskSurfaces() {
  renderTodayList();
  renderPlannerList();
  renderAchievements();
  renderRewards();
}

function attachEvents() {
  if (els.journalFilter) {
    els.journalFilter.addEventListener('input', populateJournalOptions);
  }

  if (els.journalSelect) {
    els.journalSelect.addEventListener('change', () => {
      const idx = Number(els.journalSelect.value);
      selectedGuideline = filteredGuidelines[idx];
      renderChangeResults();
    });
  }

  if (els.exportMarkdown) {
    els.exportMarkdown.addEventListener('click', exportChecklistMarkdown);
  }

  if (els.manuscriptUpload) {
    els.manuscriptUpload.addEventListener('change', handleManuscriptUpload);
  }

  if (els.figureUpload) {
    els.figureUpload.addEventListener('change', handleFigureUpload);
  }

  if (els.seedRoutines) {
    els.seedRoutines.addEventListener('click', () => {
      seedBaselineTasks();
      seedRoutineDemo();
    });
  }

  if (els.deleteRoutines) {
    els.deleteRoutines.addEventListener('click', deleteRoutineDemo);
  }

  if (els.addHabit) {
    els.addHabit.addEventListener('click', ingestHabitDemo);
  }

  if (els.refreshAchievements) {
    els.refreshAchievements.addEventListener('click', renderTaskSurfaces);
  }

  if (els.exportTasks) {
    els.exportTasks.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(taskStore.toJSON(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'taskstore-backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
      renderTaskStoreStatus('Exported current TaskStore snapshot.', 'info');
    });
  }

  if (els.importTasks) {
    els.importTasks.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const { errors } = taskStore.hydrateSnapshot(parsed);
        renderTaskSurfaces();
        persistTaskStore();
        renderTaskStoreStatus(
          errors?.length ? errors[0] : `Imported ${taskStore.tasks.size} tasks from backup.`,
          errors?.length ? 'warning' : 'info',
        );
      } catch (err) {
        renderTaskStoreStatus('Import failed. The selected file was not valid JSON.', 'error');
      }
      event.target.value = '';
    });
  }

  if (els.resetTaskData) {
    els.resetTaskData.addEventListener('click', () => {
      if (confirm('Reset all locally stored tasks? This cannot be undone.')) {
        resetTaskData();
      }
    });
  }

  if (els.taskEditorClose) {
    els.taskEditorClose.addEventListener('click', () => els.taskEditor?.close());
  }

  if (els.taskEditorForm) {
    els.taskEditorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!selectedTaskId) return;
      const form = event.target;
      const updates = {
        name: form.name.value,
        user: form.user.value,
        durationMinutes: Number(form.durationMinutes.value),
        importance: form.importance.value ? Number(form.importance.value) : undefined,
        urgency: form.urgency.value ? Number(form.urgency.value) : undefined,
        deadline: form.deadline.value || null,
        dependency: form.dependency.value || null,
        fixFlex: form.fixFlex.value,
      };
      taskStore.updateTask(selectedTaskId, updates);
      els.taskEditor?.close();
      renderTaskSurfaces();
      persistTaskStore();
    });
  }
}

renderAnalysisSummary();
renderChangeResults();
initializeGuidelines();
attachEvents();
initializeTaskStoreFromStorage();
seedBaselineTasks();
seedRoutineDemo();
renderTaskSurfaces();
