function getManifest(configurationId, logo) {
  const configured = Boolean(configurationId);

  return {
    id: ["community.tr4kerio.torznab", configurationId]
      .filter(Boolean)
      .join("."),
    version: "1.0.7",
    name: "TR4KERIO",
    description: "Résultats TR4KER via Torznab",
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
