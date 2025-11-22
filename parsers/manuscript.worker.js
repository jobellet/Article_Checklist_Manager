import { detectSectionCategory } from '../src/utils/section-utils.js';
import { countWords } from '../src/utils/text-utils.js';

importScripts('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');

function ensureNotCancelled(token) {
  if (token?.cancelled) {
    const error = new DOMException('Parsing cancelled', 'AbortError');
    error.isCancellation = true;
    throw error;
  }
}

async function parseDocxFile(file, reportProgress, token) {
  ensureNotCancelled(token);
  if (!self.JSZip) throw new Error('JSZip is unavailable in this browser.');
  reportProgress('Reading .docx file', 0.05);
  const buffer = await file.arrayBuffer();
  ensureNotCancelled(token);
  reportProgress('Extracting document', 0.15);
  const zip = await self.JSZip.loadAsync(buffer);
  ensureNotCancelled(token);
  reportProgress('Parsing document XML', 0.25);
  const documentXml = await zip.file('word/document.xml').async('string');
  ensureNotCancelled(token);
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagName('w:p'));

  const sections = [];
  const textContent = [];
  let currentTitle = null;
  let wordCount = 0;

  const getText = (p) =>
    Array.from(p.getElementsByTagName('w:t'))
      .map((t) => t.textContent)
      .join('')
      .trim();

  const isHeading = (p) =>
    Array.from(p.getElementsByTagName('w:pStyle')).some((s) =>
      s.getAttribute('w:val')?.startsWith('Heading'),
    );

  const total = paragraphs.length || 1;
  paragraphs.forEach((p, idx) => {
    ensureNotCancelled(token);
    const text = getText(p);
    if (text) {
      textContent.push(text);

      if (isHeading(p)) {
        if (currentTitle !== null) {
          sections.push({
            title: currentTitle,
            word_count: wordCount,
            category: detectSectionCategory(currentTitle),
          });
        }
        currentTitle = text;
        wordCount = 0;
      } else {
        wordCount += text.split(/\s+/).filter(Boolean).length;
      }
    }

    if (idx % 25 === 0) {
      const progress = 0.25 + (idx / total) * 0.65;
      reportProgress('Analyzing document structure', Math.min(progress, 0.9));
    }
  });

  if (currentTitle === null) {
    const totalWords = paragraphs
      .map(getText)
      .filter(Boolean)
      .reduce(
        (acc, value) => acc + value.split(/\s+/).filter(Boolean).length,
        0,
      );
    reportProgress('Finishing analysis', 0.95);
    return {
      sections: [
        { title: 'Document', word_count: totalWords, category: 'Other' },
      ],
      textContent: textContent.join('\n'),
    };
  }

  sections.push({
    title: currentTitle,
    word_count: wordCount,
    category: detectSectionCategory(currentTitle),
  });
  reportProgress('Finishing analysis', 0.95);
  return { sections, textContent: textContent.join('\n') };
}

async function parsePlainTextFile(file, reportProgress, token) {
  ensureNotCancelled(token);
  reportProgress('Reading text file', 0.1);
  const text = await file.text();
  ensureNotCancelled(token);
  const words = countWords(text);
  reportProgress('Finishing analysis', 0.95);
  return {
    sections: [{ title: file.name, word_count: words, category: 'Other' }],
    textContent: text,
  };
}

async function parseMarkdownFile(file, reportProgress, token) {
  ensureNotCancelled(token);
  reportProgress('Reading markdown', 0.1);
  const text = await file.text();
  ensureNotCancelled(token);
  const lines = text.split(/\r?\n/);
  const sections = [];
  let currentTitle = null;
  let buffer = [];

  const flushSection = () => {
    if (buffer.length === 0) return;
    const content = buffer.join(' ').trim();
    if (!content) return;
    const title = currentTitle || file.name;
    sections.push({
      title,
      word_count: countWords(content),
      category: detectSectionCategory(title),
    });
    buffer = [];
  };

  lines.forEach((line, idx) => {
    ensureNotCancelled(token);
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading) {
      flushSection();
      currentTitle = heading[2].trim();
    } else {
      buffer.push(line);
    }

    if (idx % 50 === 0) {
      const progress = 0.1 + (idx / (lines.length || 1)) * 0.75;
      reportProgress('Scanning markdown headings', Math.min(progress, 0.9));
    }
  });

  flushSection();
  reportProgress('Finishing analysis', 0.95);

  if (!sections.length) {
    return {
      sections: [
        { title: file.name, word_count: countWords(text), category: 'Other' },
      ],
      textContent: text,
    };
  }

  return { sections, textContent: text };
}

async function parseManuscriptFile(file, reportProgress, token) {
  const progressReporter = reportProgress || (() => {});
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'docx':
      return parseDocxFile(file, progressReporter, token);
    case 'txt':
      return parsePlainTextFile(file, progressReporter, token);
    case 'md':
    case 'markdown':
      return parseMarkdownFile(file, progressReporter, token);
    default:
      throw new Error(
        `Unsupported file type: .${ext}. Upload .docx, .txt, or .md/.markdown files.`,
      );
  }
}

let currentTask = null;

self.addEventListener('message', async (event) => {
  const { file, type, requestId } = event.data || {};

  if (type === 'cancel') {
    if (currentTask) {
      currentTask.cancelled = true;
      self.postMessage({
        type: 'manuscript:cancelled',
        requestId: currentTask.id,
      });
    }
    return;
  }

  if (!(file instanceof File)) {
    self.postMessage({
      type: 'manuscript:error',
      error: 'Invalid file received.',
      requestId,
    });
    return;
  }

  const task = {
    id:
      requestId ||
      `request-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cancelled: false,
  };
  currentTask = task;

  const reportProgress = (message, progress) => {
    if (currentTask !== task || task.cancelled) return;
    self.postMessage({
      type: 'manuscript:progress',
      message,
      progress,
      requestId: task.id,
    });
  };

  try {
    reportProgress('Starting analysis', 0);
    const parsed = await parseManuscriptFile(file, reportProgress, task);
    if (task.cancelled) {
      self.postMessage({ type: 'manuscript:cancelled', requestId: task.id });
      return;
    }
    self.postMessage({
      type: 'manuscript:parsed',
      data: parsed,
      requestId: task.id,
    });
  } catch (err) {
    if (task.cancelled || err?.isCancellation || err?.name === 'AbortError') {
      self.postMessage({ type: 'manuscript:cancelled', requestId: task.id });
    } else {
      const message =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      self.postMessage({
        type: 'manuscript:error',
        error: message,
        requestId: task.id,
      });
    }
  } finally {
    if (currentTask === task) {
      currentTask = null;
    }
  }
});
