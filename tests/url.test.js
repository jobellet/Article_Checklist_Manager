import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resolveGuidelinesUrl } from "../src/utils/url.js";

const originalSelf = globalThis.self;
const originalWorkerGlobalScope = globalThis.WorkerGlobalScope;

beforeEach(() => {
  delete globalThis.WorkerGlobalScope;
  delete globalThis.self;
});

afterEach(() => {
  if (originalSelf === undefined) {
    delete globalThis.self;
  } else {
    globalThis.self = originalSelf;
  }

  if (originalWorkerGlobalScope === undefined) {
    delete globalThis.WorkerGlobalScope;
  } else {
    globalThis.WorkerGlobalScope = originalWorkerGlobalScope;
  }
});

test("resolveGuidelinesUrl handles worker contexts without WorkerGlobalScope", () => {
  globalThis.self = {
    importScripts() {},
    location: { href: "https://example.com/Article_Checklist_Manager/validate/worker.js" },
  };

  const resolved = resolveGuidelinesUrl("schemas/guideline-schema.json");

  assert.equal(
    resolved,
    "https://example.com/Article_Checklist_Manager/schemas/guideline-schema.json",
  );
});

