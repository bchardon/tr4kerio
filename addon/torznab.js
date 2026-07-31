const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

const TORZNAB_URL = "https://tr4ker.net/api/torznab";
const REQUEST_TIMEOUT_MS = Number(
  process.env.REQUEST_TIMEOUT_MS || 15000
);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true
});

let parseTorrentModule = null;

async function getParseTorrent() {
  if (!parseTorrentModule) {
    const importedModule = await import("parse-torrent");
    parseTorrentModule = importedModule.default;
  }

  return parseTorrentModule;
}

function asArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getAttribute(item, attributeName) {
  const attributes = asArray(item.attr);

  const attribute = attributes.find(
    (entry) => entry && entry.name === attributeName
  );

  return attribute ? attribute.value : null;
}

function normalizeText(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

async function requestTorznab(params) {
  const response = await axios.get(TORZNAB_URL, {
    params,
    timeout: REQUEST_TIMEOUT_MS,
    responseType: "text",
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml"
    }
  });

  const parsedXml = xmlParser.parse(response.data);
  const items = asArray(parsedXml?.rss?.channel?.item);

  return items
    .filter((item) => item && item.title)
    .map((item) => {
      const enclosureUrl =
        typeof item.enclosure === "object"
          ? item.enclosure.url
          : null;

      return {
        title: normalizeText(item.title),
        downloadUrl:
          normalizeText(enclosureUrl) ||
          normalizeText(item.link),
        detailsUrl:
          normalizeText(item.comments) ||
          normalizeText(item.guid),
        infoHash: normalizeText(
          getAttribute(item, "infohash")
        ).toLowerCase(),
        seeders:
          Number(getAttribute(item, "seeders")) || 0,
        leechers:
          Number(getAttribute(item, "leechers")) || 0,
        size:
          Number(getAttribute(item, "size")) ||
          Number(item.enclosure?.length) ||
          0,
        category: normalizeText(
          getAttribute(item, "category")
        ),
        imdb: normalizeText(getAttribute(item, "imdb")),
        tmdbId: normalizeText(
          getAttribute(item, "tmdbid")
        )
      };
    })
    .filter(
      (torrent) =>
        torrent.infoHash && torrent.downloadUrl
    );
}

async function searchMovie(apiKey, imdbId) {
  return requestTorznab({
    t: "movie",
    apikey: apiKey,
    imdbid: imdbId,
    cat: "2000,2010,2040",
    limit: 100
  });
}

async function searchSeries(
  apiKey,
  imdbId,
  season,
  episode
) {
  return requestTorznab({
    t: "tvsearch",
    apikey: apiKey,
    imdbid: imdbId,
    season,
    ep: episode,
    cat: "5000,5040",
    limit: 100
  });
}

function isVideoFile(file) {
  const filePath = String(
    file.path || file.name || ""
  ).toLowerCase();

  return /\.(mkv|mp4|avi|mov|m4v|ts|m2ts|webm)$/i.test(
    filePath
  );
}

function findLargestVideoFileIndex(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return undefined;
  }

  let selectedIndex = -1;
  let selectedSize = -1;

  files.forEach((file, index) => {
    if (!isVideoFile(file)) {
      return;
    }

    const fileSize = Number(file.length) || 0;

    if (fileSize > selectedSize) {
      selectedIndex = index;
      selectedSize = fileSize;
    }
  });

  return selectedIndex >= 0
    ? selectedIndex
    : undefined;
}

/*
 * Télécharge le fichier .torrent fourni par TR4KER,
 * puis en extrait :
 *
 * - l'infoHash exact ;
 * - les URLs d'annonce du tracker privé ;
 * - l'index du plus gros fichier vidéo.
 */
async function getPlaybackMetadata(torrent) {
  const response = await axios.get(torrent.downloadUrl, {
    responseType: "arraybuffer",
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: 10 * 1024 * 1024,
    maxBodyLength: 10 * 1024 * 1024,
    headers: {
      Accept: "application/x-bittorrent"
    }
  });

  const torrentBuffer = Buffer.from(response.data);
  const parseTorrent = await getParseTorrent();
  const parsedTorrent = parseTorrent(torrentBuffer);

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

  const infoHash = normalizeText(
    parsedTorrent.infoHash || torrent.infoHash
  ).toLowerCase();

  if (!infoHash) {
    throw new Error(
      `InfoHash absent pour ${torrent.title}`
    );
  }

  if (trackers.length === 0) {
    throw new Error(
      `Aucun tracker trouvé dans ${torrent.title}`
    );
  }

  return {
    infoHash,
    sources: trackers.map(
      (tracker) => `tracker:${tracker}`
    ),
    fileIdx: findLargestVideoFileIndex(
      parsedTorrent.files
    ),
    private: Boolean(parsedTorrent.private)
  };
}

module.exports = {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
};