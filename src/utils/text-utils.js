/**
 * Normalize text for comparison by removing diacritics and lowercasing.
 * @param {string} [value]
 * @returns {string}
 */
export function normalizeSearchValue(value = '') {
  return value
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Count the number of words in a string.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
