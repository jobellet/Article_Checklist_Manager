const DEFAULT_MAX_SIZE_MB = 15;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MIME_PREFIXES = ["image/", "application/pdf"];

function validateMimeType(file, acceptedPrefixes) {
  const type = file.type || "";
  return acceptedPrefixes.some((prefix) => type === prefix || type.startsWith(prefix));
}

function validateSize(file, maxSizeBytes) {
  return file.size <= maxSizeBytes;
}

async function validateFigure(file, options) {
  const issues = [];
  const { acceptedPrefixes, maxSizeBytes } = options;

  if (!validateMimeType(file, acceptedPrefixes)) {
    issues.push(`Unsupported type (${file.type || "unknown"}). Use images or PDF.`);
  }

  if (!validateSize(file, maxSizeBytes)) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const limitMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    issues.push(`Too large (${sizeMb} MB, limit ${limitMb} MB).`);
  }

  return { file, ok: issues.length === 0, issues };
}

async function runWithConcurrency(taskFns, maxConcurrent) {
  const results = new Array(taskFns.length);
  const workerCount = Math.max(1, Math.min(maxConcurrent, taskFns.length));

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < taskFns.length) {
      const current = nextIndex;
      nextIndex += 1;
      try {
        const value = await taskFns[current]();
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  const settled = await Promise.allSettled(results.map((entry) => entry));
  return settled.map((entry) => (entry.status === "fulfilled" ? entry.value : entry));
}

export async function inspectFigures(files, options = {}) {
  const maxSizeMb = options.maxSizeMb ?? DEFAULT_MAX_SIZE_MB;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const acceptedPrefixes = options.acceptedMimePrefixes ?? DEFAULT_MIME_PREFIXES;
  const maxSizeBytes = maxSizeMb * 1024 * 1024;

  const tasks = files.map((file) => () => validateFigure(file, { acceptedPrefixes, maxSizeBytes }));
  const settledResults = await runWithConcurrency(tasks, maxConcurrent);

  return settledResults.map((result, idx) => {
    if (result.status === "fulfilled") {
      return { name: files[idx].name, ok: result.value.ok, issues: result.value.issues };
    }
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason ?? "Validation failed");
    return { name: files[idx].name, ok: false, issues: [reason] };
  });
}
