import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { loadGuidelines } from "../data/guidelines-loader.js";
import { CACHE_KEY, CACHE_TTL_MS, CACHE_VERSION } from "../data/guidelines-cache.js";

class MockStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MockStorage();
});

test("loadGuidelines fetches and caches when no cache present", async () => {
  const fetched = [{ journal: "Test Journal" }];
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => fetched };
  };

  const result = await loadGuidelines();

  assert.deepEqual(result, fetched);
  assert.equal(fetchCalls, 1);
  const cached = JSON.parse(globalThis.localStorage.getItem(CACHE_KEY));
  assert.equal(cached.version, CACHE_VERSION);
  assert.deepEqual(cached.data, fetched);
});

test("loadGuidelines returns cached value without fetching", async () => {
  const cached = { version: CACHE_VERSION, timestamp: Date.now(), data: [{ journal: "Cached" }] };
  globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called when cache is valid");
  };

  const result = await loadGuidelines();

  assert.deepEqual(result, cached.data);
});

test("loadGuidelines refetches when cache is expired", async () => {
  const oldEntry = {
    version: CACHE_VERSION,
    timestamp: Date.now() - CACHE_TTL_MS - 1000,
    data: [{ journal: "Old" }],
  };
  globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify(oldEntry));

  const refreshed = [{ journal: "Refreshed" }];
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => refreshed };
  };

  const result = await loadGuidelines();

  assert.deepEqual(result, refreshed);
  assert.equal(fetchCalls, 1);
  const cached = JSON.parse(globalThis.localStorage.getItem(CACHE_KEY));
  assert.deepEqual(cached.data, refreshed);
});
