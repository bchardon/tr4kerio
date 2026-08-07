const form = document.getElementById("config-form");
const apiKeyInput = document.getElementById("apikey");
const qualityInput = document.getElementById("quality");
const resultSection = document.getElementById("result");
const manifestInput = document.getElementById("manifest-url");
const installLink = document.getElementById("install-link");
const copyButton = document.getElementById("copy");

function createManifestUrl(apiKey, quality) {
  return `${window.location.origin}/${encodeURIComponent(
    apiKey
  )}/${encodeURIComponent(quality)}/manifest.json`;
}

function createStremioUrl(manifestUrl) {
  return manifestUrl.replace(/^https?:\/\//i, "stremio://");
}

const query = new URLSearchParams(window.location.search);
const queryApiKey = query.get("apikey");
const queryQuality = query.get("quality");

if (queryApiKey) {
  apiKeyInput.value = queryApiKey;
}

if (
  queryQuality &&
  Array.from(qualityInput.options).some(
    (option) => option.value === queryQuality
  )
) {
  qualityInput.value = queryQuality;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const quality = qualityInput.value;

  if (!apiKey) {
    alert("Renseigne ta clé API TR4KER.");
    apiKeyInput.focus();
    return;
  }

  const manifestUrl = createManifestUrl(apiKey, quality);
  const stremioUrl = createStremioUrl(manifestUrl);

  manifestInput.value = manifestUrl;
  installLink.href = stremioUrl;
  resultSection.hidden = false;

  window.location.assign(stremioUrl);
});

copyButton.addEventListener("click", async () => {
  const manifestUrl = manifestInput.value.trim();

  if (!manifestUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(manifestUrl);
  } catch {
    manifestInput.select();
    document.execCommand("copy");
  }

  copyButton.textContent = "Copié";

  setTimeout(() => {
    copyButton.textContent = "Copier";
  }, 1200);
});
