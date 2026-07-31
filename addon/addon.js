const {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
} = require("./torznab");

const RESULTS_PER_QUALITY = Math.max(
  1,
  Number(process.env.RESULTS_PER_QUALITY || 2)
);

const QUALITY_ORDER = ["4k", "1080p", "720p"];

function detectQuality(title) {
  const normalizedTitle = String(title || "").toLowerCase();

  if (
    /\b2160[pi]?\b/i.test(normalizedTitle) ||
    /\b4k\b/i.test(normalizedTitle) ||
    /\buhd\b/i.test(normalizedTitle)
  ) {
    return "4k";
  }

  if (/\b1080[pi]?\b/i.test(normalizedTitle)) {
    return "1080p";
  }

  if (/\b720[pi]?\b/i.test(normalizedTitle)) {
    return "720p";
  }

  return "other";
}

function parseRequestedQualities(value) {
  let normalized;

  try {
    normalized = decodeURIComponent(
      String(value || "1080p")
    );
  } catch {
    normalized = String(value || "1080p");
  }

  normalized = normalized
    .toLowerCase()
    .replace(/\+/g, ",")
    .replace(/\|/g, ",")
    .replace(/;/g, ",");

  if (normalized === "all") {
    return [...QUALITY_ORDER];
  }

  const requested = normalized
    .split(",")
    .map((quality) => quality.trim())
    .map((quality) => {
      if (
        quality === "2160p" ||
        quality === "2160" ||
        quality === "4k" ||
        quality === "uhd"
      ) {
        return "4k";
      }

      if (
        quality === "1080" ||
        quality === "1080p"
      ) {
        return "1080p";
      }

      if (
        quality === "720" ||
        quality === "720p"
      ) {
        return "720p";
      }

      return null;
    })
    .filter(Boolean);

  return Array.from(new Set(requested));
}

function getSourceScore(title) {
  const normalizedTitle = String(title || "").toLowerCase();

  if (/\bremux\b/i.test(normalizedTitle)) {
    return 600;
  }

  if (
    /\bblu[\s._-]?ray\b/i.test(normalizedTitle) ||
    /\bbluray\b/i.test(normalizedTitle)
  ) {
    return 500;
  }

  if (
    /\bweb[\s._-]?dl\b/i.test(normalizedTitle) ||
    /\bwebdl\b/i.test(normalizedTitle)
  ) {
    return 400;
  }

  if (
    /\bweb[\s._-]?rip\b/i.test(normalizedTitle) ||
    /\bwebrip\b/i.test(normalizedTitle)
  ) {
    return 300;
  }

  if (/\bhdtv\b/i.test(normalizedTitle)) {
    return 200;
  }

  return 100;
}

function detectSource(title) {
  const normalizedTitle = String(title || "");

  if (/\bremux\b/i.test(normalizedTitle)) {
    return "REMUX";
  }

  if (
    /\bblu[\s._-]?ray\b/i.test(normalizedTitle) ||
    /\bbluray\b/i.test(normalizedTitle)
  ) {
    return "BluRay";
  }

  if (
    /\bweb[\s._-]?dl\b/i.test(normalizedTitle) ||
    /\bwebdl\b/i.test(normalizedTitle)
  ) {
    return "WEB-DL";
  }

  if (
    /\bweb[\s._-]?rip\b/i.test(normalizedTitle) ||
    /\bwebrip\b/i.test(normalizedTitle)
  ) {
    return "WEBRip";
  }

  if (/\bhdtv\b/i.test(normalizedTitle)) {
    return "HDTV";
  }

  return "Torrent";
}

function detectCodec(title) {
  const normalizedTitle = String(title || "");

  if (/\bav1\b/i.test(normalizedTitle)) {
    return "AV1";
  }

  if (
    /\b(x265|h\.?265|hevc)\b/i.test(normalizedTitle)
  ) {
    return "HEVC";
  }

  if (
    /\b(x264|h\.?264|avc)\b/i.test(normalizedTitle)
  ) {
    return "H.264";
  }

  return null;
}

function detectHdr(title) {
  const normalizedTitle = String(title || "");
  const formats = [];

  if (
    /\b(dv|dolby[ ._-]?vision)\b/i.test(
      normalizedTitle
    )
  ) {
    formats.push("Dolby Vision");
  }

  if (
    /\bhdr10\+?\b|\bhdr\b/i.test(normalizedTitle)
  ) {
    formats.push("HDR");
  }

  return formats;
}

function detectAudio(title) {
  const normalizedTitle = String(title || "");
  const formats = [];

  if (/\batmos\b/i.test(normalizedTitle)) {
    formats.push("Atmos");
  }

  if (/\btruehd\b/i.test(normalizedTitle)) {
    formats.push("TrueHD");
  } else if (
    /\bdts(?:[ ._-]?hd)?\b/i.test(normalizedTitle)
  ) {
    formats.push("DTS");
  } else if (
    /\b(ddp|dd\+|eac3|e-ac-3)\b/i.test(
      normalizedTitle
    )
  ) {
    formats.push("DD+");
  } else if (/\bac-?3\b/i.test(normalizedTitle)) {
    formats.push("AC3");
  } else if (/\baac\b/i.test(normalizedTitle)) {
    formats.push("AAC");
  }

  return formats;
}

function detectLanguages(title) {
  const normalizedTitle = String(title || "");
  const languages = [];

  if (/\bmulti\b/i.test(normalizedTitle)) {
    languages.push("MULTi");
  }

  if (/\bvfi\b/i.test(normalizedTitle)) {
    languages.push("VFI");
  }

  if (/\bvff\b/i.test(normalizedTitle)) {
    languages.push("VFF");
  }

  if (/\bvfq\b/i.test(normalizedTitle)) {
    languages.push("VFQ");
  }

  if (/\bvostfr\b/i.test(normalizedTitle)) {
    languages.push("VOSTFR");
  }

  if (
    /\bfrench\b/i.test(normalizedTitle) ||
    /\btruefrench\b/i.test(normalizedTitle)
  ) {
    languages.push("FR");
  }

  return Array.from(new Set(languages));
}

function formatSize(bytes) {
  const size = Number(bytes) || 0;

  if (size <= 0) {
    return "Taille inconnue";
  }

  const gigabytes = size / 1024 / 1024 / 1024;

  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(
      gigabytes >= 10 ? 1 : 2
    )} Go`;
  }

  return `${(size / 1024 / 1024).toFixed(0)} Mo`;
}

function qualityLabel(quality) {
  if (quality === "4k") {
    return "4K";
  }

  if (quality === "1080p") {
    return "1080p";
  }

  if (quality === "720p") {
    return "720p";
  }

  return String(quality || "");
}

function createDescription(torrent) {
  const source = detectSource(torrent.title);
  const codec = detectCodec(torrent.title);
  const hdr = detectHdr(torrent.title);
  const audio = detectAudio(torrent.title);
  const languages = detectLanguages(torrent.title);

  const technicalDetails = [
    source,
    codec,
    ...hdr,
    ...audio,
    ...languages
  ].filter(Boolean);

  return [
    torrent.title,
    "",
    technicalDetails.join(" • "),
    `Taille : ${formatSize(torrent.size)}`,
    `Seeders : ${torrent.seeders}`,
    `Leechers : ${torrent.leechers}`
  ]
    .filter(Boolean)
    .join("\n");
}

function selectTorrentsByQuality(
  torrents,
  requestedQualities
) {
  const selected = [];
  const usedInfoHashes = new Set();

  for (const quality of requestedQualities) {
    const qualityResults = torrents
      .filter(
        (torrent) =>
          detectQuality(torrent.title) === quality
      )
      .filter(
        (torrent) =>
          torrent.infoHash &&
          Number(torrent.seeders || 0) > 0
      )
      .sort((first, second) => {
        const sourceDifference =
          getSourceScore(second.title) -
          getSourceScore(first.title);

        if (sourceDifference !== 0) {
          return sourceDifference;
        }

        const seedDifference =
          Number(second.seeders || 0) -
          Number(first.seeders || 0);

        if (seedDifference !== 0) {
          return seedDifference;
        }

        return (
          Number(first.size || 0) -
          Number(second.size || 0)
        );
      });

    let addedForQuality = 0;

    for (const torrent of qualityResults) {
      const infoHash = String(
        torrent.infoHash || ""
      ).toLowerCase();

      if (!infoHash || usedInfoHashes.has(infoHash)) {
        continue;
      }

      selected.push({
        ...torrent,
        infoHash,
        detectedQuality: quality
      });

      usedInfoHashes.add(infoHash);
      addedForQuality += 1;

      if (
        addedForQuality >= RESULTS_PER_QUALITY
      ) {
        break;
      }
    }
  }

  return selected;
}

function parseSeriesId(id) {
  const parts = String(id || "").split(":");

  return {
    imdbId: parts[0],
    season: Number(parts[1]),
    episode: Number(parts[2])
  };
}

async function loadTorrents({
  apiKey,
  type,
  id
}) {
  if (type === "movie") {
    return searchMovie(apiKey, id);
  }

  if (type === "series") {
    const {
      imdbId,
      season,
      episode
    } = parseSeriesId(id);

    if (
      !imdbId ||
      !Number.isInteger(season) ||
      !Number.isInteger(episode) ||
      season < 0 ||
      episode < 0
    ) {
      return [];
    }

    return searchSeries(
      apiKey,
      imdbId,
      season,
      episode
    );
  }

  return [];
}

/*
 * Cette fonction est volontairement synchrone.
 * Elle renvoie directement un objet stream Stremio,
 * et non une Promise.
 */
async function createStream(torrent) {
  try {
    const playback = await getPlaybackMetadata(torrent);
    const description = createDescription(torrent);

    const stream = {
      name: `TR4KER ${qualityLabel(
        torrent.detectedQuality
      )}`,

      title: description,
      description,

      infoHash: playback.infoHash,

      behaviorHints: {
        bingeGroup: `tr4ker-${torrent.detectedQuality}`,
        videoSize: Number(torrent.size) || 0
      }
    };

    /*
     * Transmet le tracker extrait du fichier .torrent,
     * y compris lorsqu'il utilise HTTPS.
     */
    if (
      Array.isArray(playback.sources) &&
      playback.sources.length > 0
    ) {
      stream.sources = playback.sources;
    }

    /*
     * Indique à Stremio quel fichier vidéo lire.
     */
    if (Number.isInteger(playback.fileIdx)) {
      stream.fileIdx = playback.fileIdx;
    }

    console.log(
      `[stream préparé] ${torrent.title} | ` +
      `sources=${playback.sources?.length || 0} | ` +
      `fileIdx=${stream.fileIdx ?? "absent"}`
    );
    console.log(JSON.stringify(stream, null, 2));
    return stream;
  } catch (error) {
    console.error(
      `[torrent] Impossible de préparer "${torrent.title}": ${error.message}`
    );

    return null;
  }
}

async function getStreams(params) {
  const apiKey = String(
    params.apikey || ""
  ).trim();

  const type = String(
    params.type || ""
  ).trim();

  const id = String(
    params.id || ""
  ).trim();

  if (!apiKey || !type || !id) {
    return { streams: [] };
  }

  const requestedQualities =
    parseRequestedQualities(params.quality);

  if (requestedQualities.length === 0) {
    return { streams: [] };
  }

  try {
    const torrents = await loadTorrents({
      apiKey,
      type,
      id
    });

    const selectedTorrents =
      selectTorrentsByQuality(
        Array.isArray(torrents) ? torrents : [],
        requestedQualities
      );

    const streams = (
      await Promise.all(
        selectedTorrents.map(createStream)
      )
    ).filter(Boolean);

    console.log(
      `[stream] ${type}/${id} | qualités=${requestedQualities.join(
        ","
      )} | torrents=${torrents.length} | streams=${streams.length}`
    );

    return { streams };
  } catch (error) {
    console.error(
      `[stream] Erreur pour ${type}/${id}: ${error.message}`
    );

    return { streams: [] };
  }
}

module.exports = {
  getStreams
};