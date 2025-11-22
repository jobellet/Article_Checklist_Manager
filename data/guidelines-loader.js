const DEFAULT_URL = "journal_guidelines.json";
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 300;

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, { retries = DEFAULT_RETRIES, backoffMs = DEFAULT_BACKOFF_MS } = {}) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch guidelines (status ${response.status})`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      const waitTime = backoffMs * 2 ** attempt;
      await delay(waitTime);
    }
    attempt += 1;
  }

  throw lastError;
}

export async function loadGuidelines(url = DEFAULT_URL, options) {
  const data = await fetchWithRetry(url, options);
  if (!Array.isArray(data)) {
    throw new Error("Unexpected guidelines response format");
  }
  return data;
}
