const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

const BASE_URL = "https://tr4ker.net/api/torznab";
const TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS || 15000);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getAttr(item, name) {
  const attrs = asArray(item.attr);
  const found = attrs.find((attr) => String(attr.name).toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

function normalizeItem(item) {
  const enclosureUrl = item.enclosure?.url || null;
  return {
    title: String(item.title || "Sans titre"),
    downloadUrl: enclosureUrl || item.link || null,
    infoHash: String(getAttr(item, "infohash") || "").toLowerCase(),
    seeders: Number(getAttr(item, "seeders") || 0),
    leechers: Number(getAttr(item, "leechers") || 0),
    size: Number(getAttr(item, "size") || item.enclosure?.length || 0),
    category: String(getAttr(item, "category") || ""),
    imdb: getAttr(item, "imdb") || null,
    tmdb: getAttr(item, "tmdbid") || null
  };
}

async function requestTorznab(params) {
  const response = await axios.get(BASE_URL, {
    params,
    timeout: TIMEOUT,
    responseType: "text",
    headers: { "User-Agent": "TR4KER-Stremio-Addon/1.0" }
  });

  const parsed = parser.parse(response.data);
  const items = asArray(parsed?.rss?.channel?.item);
  return items.map(normalizeItem).filter((item) => item.infoHash || item.downloadUrl);
}

function normalizeImdbId(id) {
  const base = String(id || "").split(":")[0];
  if (!/^tt\d+$/.test(base)) throw new Error("Identifiant IMDb invalide");
  return base;
}

function parseSeriesId(id) {
  const parts = String(id || "").split(":");
  const imdbid = normalizeImdbId(parts[0]);
  const season = Number(parts[1]);
  const episode = Number(parts[2]);
  return {
    imdbid,
    season: Number.isInteger(season) && season > 0 ? season : null,
    episode: Number.isInteger(episode) && episode > 0 ? episode : null
  };
}

async function searchMovie(apikey, id) {
  return requestTorznab({
    t: "movie",
    apikey,
    imdbid: normalizeImdbId(id),
    cat: "2000,2010,2040",
    limit: 100
  });
}

async function searchSeries(apikey, id) {
  const parsed = parseSeriesId(id);
  const params = {
    t: "tvsearch",
    apikey,
    imdbid: parsed.imdbid,
    cat: "5000,5040,5070",
    limit: 100
  };
  if (parsed.season) params.season = parsed.season;
  if (parsed.episode) params.ep = parsed.episode;
  return requestTorznab(params);
}

module.exports = { searchMovie, searchSeries };
