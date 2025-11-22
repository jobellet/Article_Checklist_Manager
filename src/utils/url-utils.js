/**
 * Resolve a URL relative to the worker or document context.
 * @param {string} path
 * @returns {string}
 */
export function resolveUrl(path) {
  try {
    const base =
      typeof import.meta !== 'undefined' && import.meta.url
        ? new URL('../', import.meta.url)
        : self.location;

    return new URL(path, base).href;
  } catch (_err) {
    return path;
  }
}
