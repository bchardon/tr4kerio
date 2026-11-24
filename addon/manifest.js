/**
 * Génère le manifeste déclaré au client, configuré ou prêt à être configuré.
 */
function getManifest(configurationId, logo, nativeMetadata = false) {
  // Une configuration installée reçoit son propre identifiant, sans exposer la clé API.
  const configured = Boolean(configurationId);

  return {
    id: ["community.tr4kerio.torznab", configurationId]
      .filter(Boolean)
      .join("."),
    version: "1.1.0",
    name: nativeMetadata ? "TR4KERIO Nuvio natif" : "TR4KERIO",
    description: nativeMetadata ? "Métadonnées .torrent complètes pour NuvioTorrent" : "Recherche C411 avec tracker HTTPS",
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
