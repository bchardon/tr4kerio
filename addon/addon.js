const {
  searchMovie,
  searchSeries,
  getPlaybackMetadata
} = require("./torznab");

const RESULTS_PER_QUALITY = Math.max(
  1,
  Number(process.env.RESULTS_PER_QUALITY || 2)
);

const QUALITY_RULES = [
  {
    value: "4k",
    label: "4K",
    pattern: /\b(?:2160[pi]?|4k|uhd)\b/i
  },
  {
    value: "1080p",
    label: "1080p",
    pattern: /\b1080[pi]?\b/i
  },
  {
    value: "720p",
    label: "720p",
    pattern: /\b720[pi]?\b/i
  }
];

const QUALITY_ALIASES = {
  "2160": "4k",
  "2160p": "4k",
  "4k": "4k",
  uhd: "4k",
  "1080": "1080p",
  "1080p": "1080p",
  "720": "720p",
  "720p": "720p"
};

const SOURCE_RULES = [
  {
    label: "REMUX",
    score: 600,
    pattern: /\bremux\b/i
  },
  {
    label: "BluRay",
    score: 500,
    pattern: /\bblu[\s._-]?ray\b/i
  },
  {
    label: "WEB-DL",
    score: 400,
    pattern: /\bweb[\s._-]?dl\b/i
  },
  {
    label: "WEBRip",
    score: 300,
    pattern: /\bweb[\s._-]?rip\b/i
  },
  {
    label: "HDTV",
    score: 200,
    pattern: /\bhdtv\b/i
  }
];

const DEFAULT_SOURCE = {
  label: "Torrent",
  score: 100
};

const CODEC_RULES = [
  { label: "AV1", pattern: /\bav1\b/i },
  {
    label: "HEVC",
    pattern: /\b(?:x265|h\.?265|hevc)\b/i
  },
  {
    label: "H.264",
    pattern: /\b(?:x264|h\.?264|avc)\b/i
  }
];

const HDR_RULES = [
  {
    label: "Dolby Vision",
    pattern: /\b(?:dv|dolby[ ._-]?vision)\b/i
  },
  {
    label: "HDR",
    pattern: /\b(?:hdr10\+?|hdr)\b/i
  }
];

const AUDIO_RULES = [
  { label: "TrueHD", pattern: /\btruehd\b/i },
  {
    label: "DTS",
    pattern: /\bdts(?:[ ._-]?hd)?\b/i
  },
  {
    label: "DD+",
    pattern: /\b(?:ddp|dd\+|eac3|e-ac-3)\b/i
  },
  { label: "AC3", pattern: /\bac-?3\b/i },
  { label: "AAC", pattern: /\baac\b/i }
];

const LANGUAGE_RULES = [
  { label: "MULTi", pattern: /\bmulti\b/i },
  { label: "VFI", pattern: /\bvfi\b/i },
  { label: "VFF", pattern: /\bvff\b/i },
  { label: "VFQ", pattern: /\bvfq\b/i },
  { label: "VF2", pattern: /\bvf2\b/i },
  { label: "VOSTFR", pattern: /\bvostfr\b/i },
  {
    label: "FR",
    pattern: /\b(?:french|truefrench)\b/i
  }
];

function findRule(title, rules) {
  return rules.find(({ pattern }) => pattern.test(title));
}

function findLabels(title, rules) {
  return rules
    .filter(({ pattern }) => pattern.test(title))
    .map(({ label }) => label);
}

function detectQuality(title) {
  return findRule(title, QUALITY_RULES)?.value || "other";
}

function parseRequestedQualities(value) {
  const normalized = String(value || "1080p")
    .toLowerCase()
    .replace(/[+|;]/g, ",");

  if (normalized === "all") {
    return QUALITY_RULES.map(({ value: quality }) => quality);
  }

  return [
    ...new Set(
      normalized
        .split(",")
        .map((quality) => QUALITY_ALIASES[quality.trim()])
        .filter(Boolean)
    )
  ];
}

function detectSource(title) {
  return findRule(title, SOURCE_RULES) || DEFAULT_SOURCE;
}

function detectCodec(title) {
  return findRule(title, CODEC_RULES)?.label || null;
}

function detectHdr(title) {
  return findLabels(title, HDR_RULES);
}

function detectAudio(title) {
  const audio = findRule(title, AUDIO_RULES)?.label;

  return [
    /\batmos\b/i.test(title) ? "Atmos" : null,
    audio
  ].filter(Boolean);
}

function detectLanguages(title) {
  return findLabels(title, LANGUAGE_RULES);
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
  return QUALITY_RULES.find(
    ({ value }) => value === quality
  )?.label || quality;
}

function createDescription(torrent) {
  const source = detectSource(torrent.title).label;
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
  const rankedTorrents = torrents
    .filter(
      ({ infoHash, seeders }) =>
        infoHash && Number(seeders) > 0
    )
    .map((torrent) => ({
      torrent,
      quality: detectQuality(torrent.title),
      sourceScore: detectSource(torrent.title).score
    }))
    .sort((first, second) =>
      Number(second.torrent.seeders) -
        Number(first.torrent.seeders) ||
      second.sourceScore - first.sourceScore ||
      Number(first.torrent.size) -
        Number(second.torrent.size)
    );

  for (const quality of requestedQualities) {
    let addedForQuality = 0;

    for (const result of rankedTorrents) {
      if (result.quality !== quality) {
        continue;
      }

      const { torrent } = result;
      const infoHash = torrent.infoHash.toLowerCase();

      if (usedInfoHashes.has(infoHash)) {
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

function parseMediaId(id) {
  const parts = id.split(":");

  if (/^tt\d+$/i.test(parts[0])) {
    return {
      identifiers: { imdbid: parts[0] },
      suffix: parts.slice(1)
    };
  }

  if (
    parts[0].toLowerCase() === "tmdb" &&
    /^\d+$/.test(parts[1])
  ) {
    return {
      identifiers: { tmdbid: parts[1] },
      suffix: parts.slice(2)
    };
  }

  return null;
}

function parseSeriesId(id) {
  const media = parseMediaId(id);

  if (!media) return null;

  const [season, episode] = media.suffix;

  return {
    identifiers: media.identifiers,
    season: Number(season),
    episode: Number(episode)
  };
}

async function loadTorrents({ apiKey, type, id }) {
  if (type === "movie") {
    const media = parseMediaId(id);
    return media
      ? searchMovie(apiKey, media.identifiers)
      : [];
  }

  if (type === "series") {
    const series = parseSeriesId(id);

    if (
      !series ||
      !Number.isInteger(series.season) ||
      !Number.isInteger(series.episode) ||
      series.season < 0 ||
      series.episode < 0
    ) {
      return [];
    }

    return searchSeries(
      apiKey,
      series.identifiers,
      series.season,
      series.episode
    );
  }

  return [];
}

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

    if (playback.sources.length > 0) {
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

  const torrents = await loadTorrents({ apiKey, type, id });
  const selectedTorrents = selectTorrentsByQuality(
    torrents,
    requestedQualities
  );
  const streams = (
    await Promise.all(selectedTorrents.map(createStream))
  ).filter(Boolean);

  console.log(
    `[stream] ${type}/${id} | torrents=${torrents.length} | ` +
    requestedQualities
      .map((quality) => {
        const candidates = torrents.filter(
          (torrent) =>
            detectQuality(torrent.title) === quality &&
            torrent.infoHash &&
            Number(torrent.seeders) > 0
        ).length;
        const ready = streams.filter(
          (stream) =>
            stream.behaviorHints?.bingeGroup ===
            `tr4ker-${quality}`
        ).length;

        return `${quality}=${ready}/${candidates}`;
      })
      .join(" | ")
  );

  return { streams };
}

module.exports = {
  getStreams
};
