function sanitizeFilePart(text) {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildFileName(guideline) {
  const parts = ["analysis"];
  if (guideline?.journal) parts.push(sanitizeFilePart(guideline.journal));
  if (guideline?.article_type) parts.push(sanitizeFilePart(guideline.article_type));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  parts.push(timestamp);
  return `${parts.filter(Boolean).join("-")}.json`;
}

export function buildAnalysisExport({
  sections = [],
  totalWords = 0,
  figureReferenceCount = 0,
  figureFileCount = 0,
  guideline = null,
  evaluation = null,
} = {}) {
  const payload = {
    generated_at: new Date().toISOString(),
    totals: {
      section_count: sections.length,
      total_words: totalWords,
      figure_references: figureReferenceCount,
      figure_uploads: figureFileCount,
    },
    sections: sections.map((section) => ({
      title: section.title,
      category: section.category,
      word_count: section.word_count,
    })),
    guideline: guideline
      ? {
          journal: guideline.journal,
          article_type: guideline.article_type,
          word_limit: guideline.word_limit,
          abstract_limit: guideline.abstract_limit,
          structure: guideline.structure,
        }
      : null,
    evaluation: evaluation
      ? {
          change_list: evaluation.changeList,
          expected_sections: evaluation.sectionDetails,
        }
      : null,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const fileName = buildFileName(guideline);

  return { blob, fileName };
}
