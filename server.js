const express = require("express");
const path = require("path");
const { createHash } = require("crypto");
const { getManifest } = require("./addon/manifest");
const { getStreams } = require("./addon/addon");

const app = express();
const PORT = Number(process.env.PORT || 7000);

// Nécessaire derrière un reverse proxy pour générer une URL d'icône en HTTPS.
app.set("trust proxy", true);

// Crée un identifiant stable propre à chaque combinaison clé, qualité et tracker.
function getConfigurationId({ apikey, quality, trackerMode = "https" }) {
  // L'identifiant reste déterministe tout en masquant les paramètres sensibles.
  return createHash("sha256")
    .update(`${apikey}\0${quality}\0${trackerMode}`)
    .digest("hex")
    .slice(0, 12);
}

// Produit l'URL absolue de l'icône à partir du domaine qui reçoit la requête.
function getLogoUrl(req) {
  return `${req.protocol}://${req.get("host")}/icon.png`;
}

// Accepte les nouveaux modes ainsi que les anciens noms utilisés dans les URL.
function normalizeTrackerMode(value = "https") {
  const mode = String(value).toLowerCase();

  if (mode === "https" || mode === "nuvio") return "https";
  if (mode === "http" || mode === "stremio") return "http";
  return null;
}

app.disable("x-powered-by");

// Les clients interrogent l'addon depuis une autre origine et ne doivent rien mettre en cache.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"]
  })
);

// Le manifeste sans paramètres dirige le client vers la configuration de l'addon.
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/manifest.json", (req, res) =>
  res.json(getManifest(undefined, getLogoUrl(req)))
);

app.get([
  "/:apikey/:quality/manifest.json",
  "/:apikey/:quality/:trackerMode/manifest.json"
], (req, res) => {
  const trackerMode = normalizeTrackerMode(
    req.params.trackerMode
  );

  if (!trackerMode) {
    return res.status(404).json({ error: "Mode tracker inconnu" });
  }

  return res.json(
    getManifest(
      getConfigurationId({ ...req.params, trackerMode }),
      getLogoUrl(req),
      trackerMode
    )
  );
});

// Cette route répond au protocole stream commun à Nuvio et Stremio.
app.get([
  "/:apikey/:quality/stream/:type/:id.json",
  "/:apikey/:quality/:trackerMode/stream/:type/:id.json"
], async (req, res) => {
  const trackerMode = normalizeTrackerMode(
    req.params.trackerMode
  );

  if (!trackerMode) {
    return res.status(404).json({ streams: [] });
  }

  try {
    const result = await getStreams({
      ...req.params,
      trackerMode
    });
    return res.json(result);
  } catch (error) {
    console.error(`[stream] ${error.message}`);
    // Une réponse vide reste exploitable par le client lorsqu'une source échoue.
    return res.json({ streams: [] });
  }
});

app.get("/configure", (_req, res) => {
  res.redirect("/");
});

app.get([
  "/:apikey/:quality/configure",
  "/:apikey/:quality/:trackerMode/configure"
], (req, res) => {
  const trackerMode = normalizeTrackerMode(
    req.params.trackerMode
  );

  if (!trackerMode) {
    return res.status(404).json({ error: "Mode tracker inconnu" });
  }

  const apikey = encodeURIComponent(req.params.apikey);
  const quality = encodeURIComponent(req.params.quality);

  return res.redirect(
    `/?apikey=${apikey}&quality=${quality}&tracker=${trackerMode}`
  );
});

app.use((_req, res) =>
  res.status(404).json({ error: "Route introuvable" })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TR4KERIO lancé sur le port ${PORT}`);
});
