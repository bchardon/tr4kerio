const form = document.getElementById("config-form");
const apiKeyInput = document.getElementById("apikey");
const qualityInput = document.getElementById("quality");
const resultSection = document.getElementById("result");
const manifestInput = document.getElementById("manifest-url");
const installLink = document.getElementById("install-link");
const copyButton = document.getElementById("copy");

// Assemble l'adresse du manifeste en encodant les paramètres placés dans le chemin.
function createManifestUrl(apiKey, quality) {
  return `${window.location.origin}/${encodeURIComponent(
    apiKey
  )}/${encodeURIComponent(quality)}/https/manifest.json`;
}

// Stremio et Nuvio reconnaissent tous deux le protocole d'installation stremio://.
function createInstallUrl(manifestUrl) {
  return manifestUrl.replace(/^https?:\/\//i, "stremio://");
}

const query = new URLSearchParams(window.location.search);
const queryApiKey = query.get("apikey");
const queryQuality = query.get("quality");

// Préremplit le formulaire lorsqu'il est rouvert depuis la route /configure.
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

// Valide le formulaire, affiche les liens générés puis ouvre l'application cliente.
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const quality = qualityInput.value;
  if (!apiKey) {
    alert("Renseigne ta clé API C411.");
    apiKeyInput.focus();
    return;
  }

  const manifestUrl = createManifestUrl(apiKey, quality);
  const installUrl = createInstallUrl(manifestUrl);

  manifestInput.value = manifestUrl;
  installLink.href = installUrl;
  installLink.textContent = "Ouvrir l'application";
  resultSection.hidden = false;

  // Le protocole personnalisé transmet directement le manifeste à l'application.
  window.location.assign(installUrl);
});

// Copie le manifeste avec une solution de repli pour les anciens navigateurs.
copyButton.addEventListener("click", async () => {
  const manifestUrl = manifestInput.value.trim();

  if (!manifestUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(manifestUrl);
  } catch {
    // Compatibilité avec les navigateurs qui bloquent l'API Clipboard.
    manifestInput.select();
    document.execCommand("copy");
  }

  copyButton.textContent = "Copié";

  setTimeout(() => {
    copyButton.textContent = "Copier";
  }, 1200);
});
