/**
 * Resolve a URL for static assets such as guideline files.
 *
 * GitHub Pages often serves the app from a subdirectory (e.g. /Article_Checklist_Manager/),
 * so we cannot rely on location.origin alone. Using the full location href preserves the
 * current pathname and ensures relative fetches work in both the main thread and workers.
 *
 * @param {string} path
 * @returns {string}
 */
export function resolveGuidelinesUrl(path) {
  try {
    const isWorker =
      (typeof WorkerGlobalScope !== 'undefined' &&
        typeof self !== 'undefined' &&
        self instanceof WorkerGlobalScope) ||
      (typeof self !== 'undefined' && typeof self.importScripts === 'function');

    if (isWorker && self.location?.href) {
      // Workers live under /validate/, so hop up one directory to the app root.
      const base = new URL('../', self.location.href);
      return new URL(path, base).href;
    }

    if (typeof self !== 'undefined' && self.location?.href) {
      return new URL(path, new URL(self.location.href)).href;
    }

    if (typeof import.meta !== 'undefined' && import.meta.url) {
      const base = new URL('../', import.meta.url);
      return new URL(path, base).href;
    }
  } catch (_error) {
    // Fall through to return the raw path below.
  }

  return path;
}
