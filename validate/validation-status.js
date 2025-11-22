const BANNER_ID = "guideline-validation-banner";
const TEXT_ID = "guideline-validation-text";

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

    const container = document.querySelector(".hero__copy") || document.body;
    container.prepend(banner);
  }
  return banner;
}

function setBanner(status, message) {
  const banner = createBanner();
  const text = banner.querySelector(`#${TEXT_ID}`);
  const statusClass = {
    pending: "muted",
    success: "success",
    error: "error",
  }[status];

  banner.dataset.status = status;
  text.textContent = message;
  text.className = statusClass ? statusClass : "muted";
}

export function wireValidationStatus(worker) {
  if (!worker) return;

  setBanner("pending", "Checking journal guidelines…");

  worker.addEventListener("message", (event) => {
    const { status, message } = event.data || {};
    if (!status || !message) return;
    setBanner(status, message);
  });
}
