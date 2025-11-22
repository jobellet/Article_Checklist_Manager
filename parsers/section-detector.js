const SECTION_PATTERNS = [
  { category: "Abstract", patterns: [/\babstract\b/i] },
  { category: "Significance Statement", patterns: [/\bsignificance statement\b/i, /\bimpact statement\b/i, /\bsignificance\b/i] },
  { category: "Introduction", patterns: [/\bintroduction\b/i, /\bbackground\b/i] },
  {
    category: "Methods",
    patterns: [
      /\bmaterials?\s*(?:&|and)\s*methods?\b/i,
      /\bmethods?\b/i,
      /\bmethodology\b/i,
      /\bapproach\b/i,
    ],
  },
  { category: "Results", patterns: [/\bresults?\b/i] },
  { category: "Discussion", patterns: [/\bdiscussion\b/i] },
  { category: "Conclusion", patterns: [/\bconclusions?\b/i] },
];

function normalizeSectionTitle(title) {
  return (title || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9&]+/g, " ")
    .toLowerCase()
    .trim();
}

function detectSectionCategory(title) {
  const normalized = normalizeSectionTitle(title);
  if (!normalized) return "Other";

  for (const { category, patterns } of SECTION_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return category;
    }
  }

  return "Other";
}

function detectSections(sections) {
  return (sections || []).map((section) => ({
    ...section,
    category: detectSectionCategory(section.title),
  }));
}

function findCategoriesInText(text) {
  const normalized = normalizeSectionTitle(text);
  const categories = new Set();

  for (const { category, patterns } of SECTION_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      categories.add(category);
    }
  }

  return categories;
}

export { SECTION_PATTERNS, detectSectionCategory, detectSections, findCategoriesInText, normalizeSectionTitle };
