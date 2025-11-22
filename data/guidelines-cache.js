export const CACHE_KEY = "acm-guidelines-cache";
export const CACHE_VERSION = 1;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch (error) {
    // Access to localStorage might throw in some environments; ignore and treat as unavailable.
  }
  return null;
}

export function readCachedGuidelines(version = CACHE_VERSION, ttlMs = CACHE_TTL_MS) {
  const storage = getStorage();
  if (!storage) return null;

  const cachedValue = storage.getItem(CACHE_KEY);
  if (!cachedValue) return null;

  try {
    const cached = JSON.parse(cachedValue);
    if (cached.version !== version) return null;
    if (!Array.isArray(cached.data)) return null;

    const timestamp = Number(cached.timestamp);
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp + ttlMs < Date.now()) return null;

    return cached.data;
  } catch (error) {
    return null;
  }
}

export function writeGuidelinesCache(data, version = CACHE_VERSION) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version,
        timestamp: Date.now(),
        data,
      })
    );
  } catch (error) {
    // Ignore storage write failures so fetching can still succeed when storage is unavailable.
  }
}

export function clearGuidelinesCache() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(CACHE_KEY);
  }
}
