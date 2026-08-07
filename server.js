const express = require("express");
const path = require("path");
const { getManifest } = require("./addon/manifest");
const { getStreams } = require("./addon/addon");

const app = express();
const PORT = Number(process.env.PORT || 7000);

app.disable("x-powered-by");

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

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/manifest.json", (_req, res) => res.json(getManifest()));

app.get("/:apikey/:quality/manifest.json", (_req, res) =>
  res.json(getManifest(true))
);

app.get("/:apikey/:quality/stream/:type/:id.json", async (req, res) => {
  try {
    const result = await getStreams(req.params);
    res.json(result);
  } catch (error) {
    console.error(`[stream] ${error.message}`);
    res.json({ streams: [] });
  }
});

app.get("/configure", (_req, res) => {
  res.redirect("/");
});

app.get("/:apikey/:quality/configure", (req, res) => {
  const apikey = encodeURIComponent(req.params.apikey);
  const quality = encodeURIComponent(req.params.quality);

  res.redirect(`/?apikey=${apikey}&quality=${quality}`);
});

app.use((_req, res) =>
  res.status(404).json({ error: "Route introuvable" })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TR4KER Stremio Addon lancé sur le port ${PORT}`);
});
