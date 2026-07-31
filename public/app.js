const form = document.querySelector("#config-form");
const result = document.querySelector("#result");
const manifestInput = document.querySelector("#manifest-url");
const installLink = document.querySelector("#install-link");
const copyButton = document.querySelector("#copy");

if (configuredApiKey) {
  const apiKeyInput = form.querySelector('[name="apikey"]');

  if (apiKeyInput) {
    apiKeyInput.value = configuredApiKey;
  }
}

if (configuredQuality) {
  const qualityInput = form.querySelector(
    `[name="quality"][value="${CSS.escape(configuredQuality)}"]`
  );

  if (qualityInput) {
    qualityInput.checked = true;
  }
}

function buildManifestUrl(apikey, quality) {
  const base = window.location.origin.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(apikey.trim())}/${encodeURIComponent(quality)}/manifest.json`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const apikey = String(data.get("apikey") || "").trim();
  const quality = String(data.get("quality") || "1080p");

  if (!/^tr4k_[A-Za-z0-9]+$/.test(apikey)) {
    alert("La clé API ne semble pas valide.");
    return;
  }

  const manifestUrl = buildManifestUrl(apikey, quality);
  manifestInput.value = manifestUrl;
  installLink.href = `stremio://${manifestUrl.replace(/^https?:\/\//, "")}`;
  result.hidden = false;
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(manifestInput.value);
  copyButton.textContent = "Copié";
  setTimeout(() => { copyButton.textContent = "Copier"; }, 1200);
});
