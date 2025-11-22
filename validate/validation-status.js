const BANNER_ID = "guideline-validation-banner";
const TEXT_ID = "guideline-validation-text";
const DETAILS_ID = "guideline-validation-details";

function createBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.className = "info-card";

    const heading = document.createElement("p");
    heading.className = "label";
    heading.textContent = "Guideline data";

    const text = document.createElement("p");
    text.id = TEXT_ID;
    text.className = "muted";

    banner.appendChild(heading);
    banner.appendChild(text);

    const details = document.createElement("ul");
    details.id = DETAILS_ID;
    details.className = "muted";
    details.hidden = true;

    banner.appendChild(details);

    const container = document.querySelector(".hero__copy") || document.body;
    container.prepend(banner);
  }
  return banner;
}

function renderErrorDetails(banner, details = []) {
  const list = banner.querySelector(`#${DETAILS_ID}`);
  if (!list) return;

  list.innerHTML = "";

  const limitedDetails = Array.isArray(details) ? details.slice(0, 3) : [];
  if (!limitedDetails.length) {
    list.hidden = true;
    return;
  }

  for (const detail of limitedDetails) {
    const item = document.createElement("li");
    item.textContent = detail;
    list.appendChild(item);
  }

  list.hidden = false;
}

function resolveStatusMessage(status, message) {
  if (status !== "error" || !message) return message;

  const normalized = message.toLowerCase();
  if (normalized.includes("failed to fetch") || normalized.includes("404")) {
    return "Could not load journal guidelines file. Check that journal_guidelines.json and schemas/guideline-schema.json exist at the app root.";
  }

  return message;
}

function setBanner(status, message, details = []) {
  const banner = createBanner();
  const text = banner.querySelector(`#${TEXT_ID}`);
  const statusClass = {
    pending: "muted",
    success: "success",
    error: "error",
  }[status];

  banner.dataset.status = status;
  text.textContent = resolveStatusMessage(status, message);
  text.className = statusClass ? statusClass : "muted";

  if (status === "error") {
    renderErrorDetails(banner, details);
  } else {
    renderErrorDetails(banner, []);
  }
}

export function wireValidationStatus(worker) {
  if (!worker) return;

  setBanner("pending", "Checking journal guidelines…");

  worker.addEventListener("message", (event) => {
    const { status, message, details } = event.data || {};
    if (!status || !message) return;
    setBanner(status, message, details);
  });
}
