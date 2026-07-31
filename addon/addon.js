const {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
} = require("./torznab");

const RESULTS_PER_QUALITY = Number(
  process.env.RESULTS_PER_QUALITY || 2
);

const QUALITY_ORDER = ["4k", "1080p", "720p"];

function detectQuality(title) {
  const normalizedTitle = title.toLowerCase();

  if (
    /\b2160p?\b/i.test(normalizedTitle) ||
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
  const normalized = decodeURIComponent(
    String(value || "1080p")
  )
    .toLowerCase()
    .replace(/\+/g, ",")
    .replace(/\|/g, ",");

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
        quality === "4k"
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
  const normalizedTitle = title.toLowerCase();

  if (/\bremux\b/i.test(normalizedTitle)) {
    return 600;
  }

  if (
    /\bblu[\s.-]?ray\b/i.test(normalizedTitle) ||
    /\bbluray\b/i.test(normalizedTitle)
  ) {
    return 500;
  }

  if (
    /\bweb[\s.-]?dl\b/i.test(normalizedTitle) ||
    /\bwebdl\b/i.test(normalizedTitle)
  ) {
    return 400;
  }

  if (
    /\bweb[\s.-]?rip\b/i.test(normalizedTitle) ||
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
  if (/\bremux\b/i.test(title)) {
    return "REMUX";
  }

  if (/\bblu[\s.-]?ray\b|\bbluray\b/i.test(title)) {
    return "BluRay";
  }

  if (/\bweb[\s.-]?dl\b|\bwebdl\b/i.test(title)) {
    return "WEB-DL";
  }

  if (/\bweb[\s.-]?rip\b|\bwebrip\b/i.test(title)) {
    return "WEBRip";
  }

  if (/\bhdtv\b/i.test(title)) {
    return "HDTV";
  }

  return "Torrent";
}

function detectCodec(title) {
  if (/\bav1\b/i.test(title)) {
    return "AV1";
  }

  if (/\b(x265|h\.?265|hevc)\b/i.test(title)) {
    return "HEVC";
  }

  if (/\b(x264|h\.?264|avc)\b/i.test(title)) {
    return "H.264";
  }

  return null;
}

function detectHdr(title) {
  const formats = [];

  if (/\b(dv|dolby[ ._-]?vision)\b/i.test(title)) {
    formats.push("Dolby Vision");
  }

  if (/\bhdr10\+?\b|\bhdr\b/i.test(title)) {
    formats.push("HDR");
  }

  return formats;
}

function detectAudio(title) {
  const formats = [];

  if (/\batmos\b/i.test(title)) {
    formats.push("Atmos");
  }

  if (/\btruehd\b/i.test(title)) {
    formats.push("TrueHD");
  } else if (/\bdts(?:-hd)?\b/i.test(title)) {
    formats.push("DTS");
  } else if (/\b(ddp|dd\+|eac3)\b/i.test(title)) {
    formats.push("DD+");
  } else if (/\baac\b/i.test(title)) {
    formats.push("AAC");
  }

  return formats;
}

function detectLanguages(title) {
  const languages = [];

  if (/\bmulti\b/i.test(title)) {
    languages.push("MULTi");
  }

  if (/\bvfi\b/i.test(title)) {
    languages.push("VFI");
  }

  if (/\bvff\b/i.test(title)) {
    languages.push("VFF");
  }

  if (/\bvfq\b/i.test(title)) {
    languages.push("VFQ");
  }

  if (/\bfr(?:ench)?\b/i.test(title)) {
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

  return quality;
}

function createDescription(torrent, quality) {
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

  for (const quality of requestedQualities) {
    const qualityResults = torrents
      .filter(
        (torrent) =>
          detectQuality(torrent.title) === quality
      )
      .filter((torrent) => torrent.seeders > 0)
      .sort((first, second) => {
        const sourceDifference =
          getSourceScore(second.title) -
          getSourceScore(first.title);

        if (sourceDifference !== 0) {
          return sourceDifference;
        }

        const seedDifference =
          second.seeders - first.seeders;

        if (seedDifference !== 0) {
          return seedDifference;
        }

        return first.size - second.size;
      })
      .slice(0, RESULTS_PER_QUALITY)
      .map((torrent) => ({
        ...torrent,
        detectedQuality: quality
      }));

    selected.push(...qualityResults);
  }

  return selected;
}

function parseSeriesId(id) {
  const parts = String(id).split(":");

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
    const { imdbId, season, episode } =
      parseSeriesId(id);

    if (
      !imdbId ||
      !Number.isInteger(season) ||
      !Number.isInteger(episode)
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

async function createStream(torrent) {
  try {
    const playback = await getPlaybackMetadata(torrent);

    const stream = {
      name: `TR4KER\n${qualityLabel(
        torrent.detectedQuality
      )}`,

      title: createDescription(
        torrent,
        torrent.detectedQuality
      ),

      description: createDescription(
        torrent,
        torrent.detectedQuality
      ),

      infoHash: playback.infoHash,

      behaviorHints: {
        bingeGroup: `tr4ker-${torrent.detectedQuality}`,
        videoSize: torrent.size
      }
    };

    /*
     * Ne fournir sources que lorsqu'il existe
     * réellement des trackers valides.
     */
    if (
      Array.isArray(playback.sources) &&
      playback.sources.length > 0
    ) {
      stream.sources = playback.sources;
    }

    if (Number.isInteger(playback.fileIdx)) {
      stream.fileIdx = playback.fileIdx;
    }

    return stream;
  } catch (error) {
    console.error(
      `[torrent] Impossible de préparer "${torrent.title}": ${error.message}`
    );

    return null;
  }
}

async function getStreams(params) {
  const apiKey = String(params.apikey || "").trim();
  const type = String(params.type || "").trim();
  const id = String(params.id || "").trim();

  if (!apiKey || !type || !id) {
    return { streams: [] };
  }

  const requestedQualities =
    parseRequestedQualities(params.quality);

  if (requestedQualities.length === 0) {
    return { streams: [] };
  }

  const torrents = await loadTorrents({
    apiKey,
    type,
    id
  });

  const selectedTorrents =
    selectTorrentsByQuality(
      torrents,
      requestedQualities
    );

  const streams = (
    await Promise.all(
      selectedTorrents.map(createStream)
    )
  ).filter(Boolean);

  return { streams };
}

module.exports = {
  getStreams
};