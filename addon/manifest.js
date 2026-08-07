/**
 * Génère le manifeste déclaré au client, configuré ou prêt à être configuré.
 */
function getManifest(configurationId, logo) {
  // Une configuration installée reçoit son propre identifiant, sans exposer la clé API.
  const configured = Boolean(configurationId);

  return {
    id: ["community.tr4kerio.torznab", configurationId]
      .filter(Boolean)
      .join("."),
    version: "1.0.8",
    name: "TR4KERIO",
    description: "Recherche TR4KER pour Nuvio",
    logo,

    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt", "tmdb"],

    behaviorHints: {
      configurable: true,
      configurationRequired: !configured
    }
  };
}

module.exports = { getManifest };
