const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

const TORZNAB_URL =
  process.env.TORZNAB_URL ||
  "https://tr4ker.net/api/torznab";

const REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.REQUEST_TIMEOUT_MS || 15000)
);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

let parseTorrentModule;

async function getParseTorrent() {
  if (!parseTorrentModule) {
    const imported = await import("parse-torrent");
    parseTorrentModule = imported.default;
  }

  return parseTorrentModule;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "object") {
    return typeof value["#text"] === "string"
      ? value["#text"].trim()
      : "";
  }

  return String(value).trim();
}

function getAttribute(item, attributeName) {
  const attributes = asArray(item?.attr);

  const attribute = attributes.find(
    (entry) =>
      entry &&
      String(entry.name || "").toLowerCase() ===
      String(attributeName).toLowerCase()
  );

  return normalizeText(attribute?.value);
}

function getEnclosureUrl(item) {
  const enclosure = item?.enclosure;
  return normalizeText(
    typeof enclosure === "object"
      ? enclosure?.url
      : enclosure
  );
}

function normalizeInfoHash(value) {
  const normalized = normalizeText(value)
    .replace(/^urn:btih:/i, "")
    .toLowerCase();

  return /^[a-f0-9]{40}$/i.test(normalized)
    ? normalized
    : "";
}

function parseTorrentItem(item) {
  const title = normalizeText(item?.title);

  if (!title) {
    return null;
  }

  const infoHash = normalizeInfoHash(
    getAttribute(item, "infohash")
  );

  return {
    title,
    infoHash,
    downloadUrl:
      getEnclosureUrl(item) || normalizeText(item?.link),
    size:
      Number(getAttribute(item, "size")) ||
      Number(item?.enclosure?.length) ||
      0,
    seeders: Number(getAttribute(item, "seeders")) || 0,
    leechers: Number(getAttribute(item, "leechers")) || 0
  };
}

async function requestTorznab(params) {
  const response = await axios.get(TORZNAB_URL, {
    params,
    timeout: REQUEST_TIMEOUT_MS,
    responseType: "text",
    headers: {
      Accept:
        "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent":
        "TR4KER-Stremio-Addon/1.0"
    }
  });

  const parsedXml = xmlParser.parse(response.data);

  const channel = parsedXml?.rss?.channel;

  if (!channel) {
    throw new Error(
      "Réponse Torznab invalide : canal RSS introuvable"
    );
  }

  return asArray(channel.item)
    .map(parseTorrentItem)
    .filter(Boolean)
    .filter((torrent) => torrent.infoHash);
}

function normalizeIdentifiers(identifiers = {}) {
  const imdbid = String(identifiers.imdbid || "").trim();
  const tmdbid = String(identifiers.tmdbid || "").trim();

  if (/^tt\d+$/i.test(imdbid)) return { imdbid };
  if (/^\d+$/.test(tmdbid)) return { tmdbid };
  return null;
}

async function searchMovie(apiKey, identifiers) {
  const normalizedApiKey = String(apiKey || "").trim();
  const normalizedIdentifiers = normalizeIdentifiers(identifiers);

  if (!normalizedApiKey || !normalizedIdentifiers) {
    return [];
  }

  return requestTorznab({
    t: "movie",
    apikey: normalizedApiKey,
    ...normalizedIdentifiers,
    cat: "2000,2010,2040",
    limit: 100
  });
}

async function searchSeries(
  apiKey,
  identifiers,
  season,
  episode
) {
  const normalizedApiKey = String(apiKey || "").trim();
  const normalizedIdentifiers = normalizeIdentifiers(identifiers);

  const normalizedSeason = Number(season);
  const normalizedEpisode = Number(episode);

  if (
    !normalizedApiKey ||
    !normalizedIdentifiers ||
    !Number.isInteger(normalizedSeason) ||
    !Number.isInteger(normalizedEpisode)
  ) {
    return [];
  }

  return requestTorznab({
    t: "tvsearch",
    apikey: normalizedApiKey,
    ...normalizedIdentifiers,
    season: normalizedSeason,
    ep: normalizedEpisode,
    cat: "5000,5040,5070",
    limit: 100
  });
}

async function getPlaybackMetadata(torrent) {
  if (!torrent.downloadUrl) {
    throw new Error(
      `URL de téléchargement absente pour ${torrent.title}`
    );
  }

  const response = await axios.get(torrent.downloadUrl, {
    responseType: "arraybuffer",
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,
    headers: {
      Accept: "application/x-bittorrent"
    }
  });

  const torrentBuffer = Buffer.from(response.data);
  const parseTorrent = await getParseTorrent();

  const parsedTorrent = await parseTorrent(torrentBuffer);

  const trackers = Array.from(
    new Set(
      asArray(parsedTorrent.announce)
        .map((tracker) => normalizeText(tracker))
        .filter(
          (tracker) =>
            tracker.startsWith("http://") ||
            tracker.startsWith("https://") ||
            tracker.startsWith("udp://")
        )
    )
  );

  const infoHash = normalizeInfoHash(
    parsedTorrent.infoHash || torrent.infoHash
  );

  if (!infoHash) {
    throw new Error(
      `InfoHash absent pour ${torrent.title}`
    );
  }

  const files = asArray(parsedTorrent.files);

  let fileIdx;

  if (files.length > 0) {
    const videoExtensions =
      /\.(mkv|mp4|avi|mov|m4v|ts|m2ts|webm)$/i;

    let largestSize = -1;

    files.forEach((file, index) => {
      const filePath = String(
        file.path || file.name || ""
      );

      const fileSize = Number(file.length) || 0;

      if (
        videoExtensions.test(filePath) &&
        fileSize > largestSize
      ) {
        largestSize = fileSize;
        fileIdx = index;
      }
    });
  }

  return {
    infoHash,
    fileIdx,
    sources: trackers.map(
      (tracker) => `tracker:${tracker}`
    )
  };
}

module.exports = {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
};
