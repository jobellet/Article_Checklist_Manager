importScripts("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");

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

async function parseDocxFile(file) {
  if (!self.JSZip) throw new Error("JSZip is unavailable in this browser.");
  const buffer = await file.arrayBuffer();
  const zip = await self.JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  const parser = new DOMParser();
  const xml = parser.parseFromString(documentXml, "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));

  const sections = [];
  const textContent = [];
  let currentTitle = null;
  let wordCount = 0;

  const getText = (p) =>
    Array.from(p.getElementsByTagName("w:t"))
      .map((t) => t.textContent)
      .join("")
      .trim();

  const isHeading = (p) =>
    Array.from(p.getElementsByTagName("w:pStyle"))
      .some((s) => s.getAttribute("w:val")?.startsWith("Heading"));

  for (const p of paragraphs) {
    const text = getText(p);
    if (!text) continue;
    textContent.push(text);

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
    return { sections: [{ title: "Document", word_count: total, category: "Other" }], textContent: textContent.join("\n") };
  }

  sections.push({ title: currentTitle, word_count: wordCount, category: categorizeSection(currentTitle) });
  return { sections, textContent: textContent.join("\n") };
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
  let currentTitle = null;
  let buffer = [];

  const flushSection = () => {
    if (buffer.length === 0) return;
    const content = buffer.join(" ").trim();
    if (!content) return;
    const title = currentTitle || file.name;
    sections.push({ title, word_count: countWords(content), category: categorizeSection(title) });
    buffer = [];
  };

  lines.forEach((line) => {
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading) {
      flushSection();
      currentTitle = heading[2].trim();
    } else {
      buffer.push(line);
    }
  });

  flushSection();

  if (!sections.length) {
    return { sections: [{ title: file.name, word_count: countWords(text), category: "Other" }], textContent: text };
  }

  return { sections, textContent: text };
}

async function parseManuscriptFile(file) {
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

self.addEventListener("message", async (event) => {
  const { file } = event.data || {};
  if (!(file instanceof File)) {
    self.postMessage({ type: "manuscript:error", error: "Invalid file received." });
    return;
  }

  try {
    const parsed = await parseManuscriptFile(file);
    self.postMessage({ type: "manuscript:parsed", data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred.";
    self.postMessage({ type: "manuscript:error", error: message });
  }
});
