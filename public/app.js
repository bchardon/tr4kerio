const form = document.getElementById("config-form");
const apiKeyInput = document.getElementById("apikey");
const qualityInput = document.getElementById("quality");
const resultSection = document.getElementById("result");
const manifestInput = document.getElementById("manifest-url");
const installLink = document.getElementById("install-link");
const copyButton = document.getElementById("copy");

function createManifestUrl(apiKey, quality) {
  const origin = window.location.origin.replace(/\/$/, "");

  return `${origin}/${encodeURIComponent(apiKey)}/${encodeURIComponent(
    quality
  )}/manifest.json`;
}

function createStremioUrl(manifestUrl) {
  return manifestUrl.replace(/^https?:\/\//i, "stremio://");
}

/*
 * Préremplit le formulaire après avoir cliqué sur
 * "Configurer" dans Stremio.
 */
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
  event.stopPropagation();

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

  /*
   * Lance Stremio pendant l'action utilisateur.
   */
  window.location.assign(stremioUrl);
});

installLink.addEventListener("click", () => {
  const manifestUrl = manifestInput.value.trim();

  if (manifestUrl) {
    installLink.href = createStremioUrl(manifestUrl);
  }
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

  const previousText = copyButton.textContent;
  copyButton.textContent = "Copié";

  setTimeout(() => {
    copyButton.textContent = previousText;
  }, 1200);
});