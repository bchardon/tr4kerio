const form = document.getElementById("config-form");
const apiKeyInput = document.getElementById("apikey");
const qualityInput = document.getElementById("quality");
const resultSection = document.getElementById("result");
const manifestInput = document.getElementById("manifest-url");
const installLink = document.getElementById("install-link");
const copyButton = document.getElementById("copy");

// Assemble l'adresse du manifeste en encodant les paramètres placés dans le chemin.
function createManifestUrl(apiKey, quality, client) {
  // Le client reste dans le chemin de base et détermine le relais tracker utilisé.
  return `${window.location.origin}/${encodeURIComponent(
    apiKey
  )}/${encodeURIComponent(quality)}/${client}/manifest.json`;
}

// Transforme le manifeste en lien profond propre à l'application choisie.
function createInstallUrl(manifestUrl, client) {
  return manifestUrl.replace(
    /^https?:\/\//i,
    `${client}://`
  );
}

const query = new URLSearchParams(window.location.search);
const queryApiKey = query.get("apikey");
const queryQuality = query.get("quality");
const queryClient = query.get("client");

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
  const submittedClient = event.submitter?.value;
  const client = ["nuvio", "stremio"].includes(
    submittedClient
  )
    ? submittedClient
    : queryClient === "stremio"
      ? "stremio"
      : "nuvio";

  if (!apiKey) {
    alert("Renseigne ta clé API TR4KER.");
    apiKeyInput.focus();
    return;
  }

  const manifestUrl = createManifestUrl(
    apiKey,
    quality,
    client
  );
  const installUrl = createInstallUrl(manifestUrl, client);

  manifestInput.value = manifestUrl;
  installLink.href = installUrl;
  installLink.textContent = `Ouvrir ${
    client === "stremio" ? "Stremio" : "Nuvio"
  }`;
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
