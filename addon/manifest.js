function getManifest(configurationId) {
  const configured = Boolean(configurationId);

  return {
    id: ["community.tr4kerio.torznab", configurationId]
      .filter(Boolean)
      .join("."),
    version: "1.0.7",
    name: "TR4KERIO",
    description: "Résultats TR4KER via Torznab",
    logo: "https://tr4ker.net/favicon.ico",

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
