function getManifest(configured = false) {
  return {
    id: "community.tr4ker.torznab",
    version: "1.0.7",
    name: "TR4KER",
    description: "Résultats TR4KER via Torznab",
    logo: "https://tr4ker.net/favicon.ico",

    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"],

    behaviorHints: {
      configurable: true,
      configurationRequired: !configured
    }
  };
}

module.exports = { getManifest };