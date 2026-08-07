const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

const TORZNAB_URL =
  process.env.TORZNAB_URL ||
  "https://tr4ker.net/api/torznab";

const CINEMETA_URL =
  process.env.CINEMETA_URL ||
  "https://v3-cinemeta.strem.io";

const TRACKER_PROXY_URL = String(
  process.env.TRACKER_PROXY_URL || ""
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.REQUEST_TIMEOUT_MS || 15000)
);

// Conserve les attributs Torznab tout en uniformisant les balises avec namespace.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

// parse-torrent est un module ESM : son import dynamique est mémorisé après le premier appel.
let parseTorrentModule;
const seriesTitleCache = new Map();

async function getParseTorrent() {
  if (!parseTorrentModule) {
    const imported = await import("parse-torrent");
    parseTorrentModule = imported.default;
  }

  return parseTorrentModule;
}

// Uniformise les champs XML qui peuvent contenir un objet unique ou une liste.
function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// Extrait une chaîne propre depuis une valeur XML simple ou un nœud « #text ».
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

// Recherche un attribut Torznab sans tenir compte de la casse de son nom.
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

/**
 * Fait passer uniquement le tracker privé TR4KER par le relais HTTPS configuré.
 * Le chemin contenant le passkey et les paramètres d'annonce restent inchangés.
 */
function getPlaybackTrackerUrl(tracker) {
  if (!TRACKER_PROXY_URL) return tracker;

  try {
    const trackerUrl = new URL(tracker);

    if (trackerUrl.hostname.toLowerCase() !== "tk.tr4ker.net") {
      return tracker;
    }

    return (
      `${TRACKER_PROXY_URL}${trackerUrl.pathname}` +
      trackerUrl.search
    );
  } catch {
    return tracker;
  }
}

/**
 * Convertit un élément RSS Torznab en objet torrent utilisé par l'addon.
 */
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

/**
 * Interroge TR4KER, analyse le XML et ne conserve que les torrents valides.
 */
async function requestTorznab(params) {
  const response = await axios.get(TORZNAB_URL, {
    params,
    timeout: REQUEST_TIMEOUT_MS,
    responseType: "text",
    headers: {
      Accept:
        "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent":
        "TR4KERIO/1.0"
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

// Valide les identifiants avant de les transmettre à une API distante.
function normalizeIdentifiers(identifiers = {}) {
  const imdbid = String(identifiers.imdbid || "").trim();
  const tmdbid = String(identifiers.tmdbid || "").trim();

  if (/^tt\d+$/i.test(imdbid)) return { imdbid };
  if (/^\d+$/.test(tmdbid)) return { tmdbid };
  return null;
}

/**
 * Résout et met en cache le titre d'une série depuis son identifiant IMDb.
 */
async function getSeriesTitle(imdbid) {
  if (!imdbid) return "";

  // La recherche TV de TR4KER est plus fiable avec le titre résolu par Cinemeta.
  if (!seriesTitleCache.has(imdbid)) {
    const request = axios
      .get(
        `${CINEMETA_URL}/meta/series/${encodeURIComponent(
          imdbid
        )}.json`,
        { timeout: REQUEST_TIMEOUT_MS }
      )
      .then(({ data }) => normalizeText(data?.meta?.name))
      .catch((error) => {
        seriesTitleCache.delete(imdbid);
        console.error(
          `[metadata] ${imdbid}: ${error.message}`
        );
        return "";
      });

    seriesTitleCache.set(imdbid, request);
  }

  return seriesTitleCache.get(imdbid);
}

// Couvre les écritures S01E02, 1x02 et « season 1 episode 2 ».
function getEpisodePattern(season, episode) {
  return new RegExp(
    `\\b(?:` +
      `s0*${season}[ ._-]*e0*${episode}|` +
      `0*${season}x0*${episode}|` +
      `season[ ./_-]*0*${season}[ ./_-]+` +
        `(?:episode|ep)[ ._-]*0*${episode}` +
    `)\\b`,
    "i"
  );
}

// Reconnaît un numéro de saison dans les principaux formats de nommage.
function getSeasonPattern(season) {
  return new RegExp(
    `\\b(?:s(?:eason)?[ ._-]*0*${season})\\b`,
    "i"
  );
}

const ANY_EPISODE_PATTERN =
  /\b(?:s0*\d+[ ._-]*e0*\d+|0*\d+x0*\d+|season[ ./_-]*\d+[ ./_-]+(?:episode|ep)[ ._-]*\d+)\b/i;

/**
 * Classe une release comme épisode exact, pack ou résultat non pertinent.
 */
function getSeriesReleaseType(title, season, episode) {
  // Écarte les épisodes voisins, mais conserve l'épisode demandé et les packs de saison.
  if (getEpisodePattern(season, episode).test(title)) {
    return "episode";
  }

  if (ANY_EPISODE_PATTERN.test(title)) {
    return null;
  }

  return getSeasonPattern(season).test(title)
    ? "season"
    : null;
}

/**
 * Sélectionne le bon fichier vidéo et conserve son index dans le torrent.
 */
function getVideoFile(files, torrent) {
  const videoExtensions =
    /\.(mkv|mp4|avi|mov|m4v|ts|m2ts|webm)$/i;
  const videoFiles = files
    .map((file, index) => ({
      index,
      path: String(file.path || file.name || ""),
      size: Number(file.length) || 0
    }))
    .filter((file) => videoExtensions.test(file.path));

  const episodeFiles =
    Number.isInteger(torrent.requestedSeason) &&
    Number.isInteger(torrent.requestedEpisode)
      ? videoFiles.filter((file) =>
          getEpisodePattern(
            torrent.requestedSeason,
            torrent.requestedEpisode
          ).test(file.path)
        )
      : [];

  if (torrent.seasonPack && episodeFiles.length === 0) {
    // Ne jamais lancer arbitrairement le plus gros fichier d'un pack incomplet.
    throw new Error(
      `Épisode S${torrent.requestedSeason}E${torrent.requestedEpisode} ` +
      `introuvable dans ${torrent.title}`
    );
  }

  return (episodeFiles.length > 0
    ? episodeFiles
    : videoFiles
  ).sort((first, second) => second.size - first.size)[0];
}

/**
 * Recherche jusqu'à 100 films avec l'identifiant compris par TR4KER.
 */
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

/**
 * Recherche une saison, puis filtre localement l'épisode et les packs compatibles.
 */
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

  const title = await getSeriesTitle(
    normalizedIdentifiers.imdbid
  );

  // « ep » est volontairement omis : TR4KER renvoie alors aussi les packs de saison.
  const torrents = await requestTorznab({
    t: "tvsearch",
    apikey: normalizedApiKey,
    ...(title ? { q: title } : normalizedIdentifiers),
    season: normalizedSeason,
    limit: 100
  });

  return torrents.flatMap((torrent) => {
    const releaseType = getSeriesReleaseType(
      torrent.title,
      normalizedSeason,
      normalizedEpisode
    );

    return releaseType
      ? [{
          ...torrent,
          requestedSeason: normalizedSeason,
          requestedEpisode: normalizedEpisode,
          seasonPack: releaseType === "season"
        }]
      : [];
  });
}

/**
 * Analyse le .torrent pour obtenir son hash, ses trackers et le fichier à lire.
 */
async function getPlaybackMetadata(torrent) {
  if (!torrent.downloadUrl) {
    throw new Error(
      `URL de téléchargement absente pour ${torrent.title}`
    );
  }

  // Le fichier .torrent fournit les trackers et l'index exact à lire dans un pack.
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
  const videoFile = getVideoFile(files, torrent);
  const fileName = videoFile?.path
    .split(/[\\/]/)
    .pop();

  if (torrent.seasonPack) {
    console.log(
      `[pack] ${torrent.title} | ` +
      `fileIdx=${videoFile.index} | fichier=${fileName}`
    );
  }

  return {
    infoHash,
    fileIdx: videoFile?.index,
    fileName,
    fileSize: videoFile?.size || 0,
    sources: trackers.map(
      (tracker) =>
        `tracker:${getPlaybackTrackerUrl(tracker)}`
    )
  };
}

module.exports = {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
};
