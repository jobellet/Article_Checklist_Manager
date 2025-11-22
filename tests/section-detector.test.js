import assert from "node:assert/strict";
import { test } from "node:test";
import { detectSections, detectSectionCategory } from "../parsers/section-detector.js";

test("detectSectionCategory handles capitalization and prefixes", () => {
  assert.equal(detectSectionCategory("1. INTRODUCTION"), "Introduction");
  assert.equal(detectSectionCategory("Background and overview"), "Introduction");
});

test("detectSections maps common synonyms", () => {
  const blocks = [
    { title: "Materials & Methods", word_count: 120 },
    { title: "RESULTS AND DISCUSSION", word_count: 300 },
    { title: "Impact Statement", word_count: 80 },
  ];

  const detected = detectSections(blocks);
  assert.deepEqual(detected.map((b) => b.category), ["Methods", "Results", "Significance Statement"]);
});

test("detectSections tolerates whitespace and surrounding text", () => {
  const blocks = [
    { title: "   Discussion   ", word_count: 50 },
    { title: "Conclusions & Future Work", word_count: 75 },
  ];

  const detected = detectSections(blocks);
  assert.equal(detected[0].category, "Discussion");
  assert.equal(detected[1].category, "Conclusion");
});
