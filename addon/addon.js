const { searchMovie, searchSeries } = require("./torznab");
const { analyzeRelease, matchesQuality } = require("./release-parser");

const MAX_RESULTS = Math.max(1, Number(process.env.MAX_RESULTS || 50));

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "taille inconnue";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 2 : 0)} ${units[index]}`;
}

function buildDescription(torrent, release) {
  const details = [release.qualityLabel, release.source, ...release.video, ...release.audio, ...release.languages]
    .filter(Boolean)
    .join(" • ");
  return [
    details,
    `👥 ${torrent.seeders} seeders • 💾 ${formatSize(torrent.size)}`,
    torrent.title
  ].filter(Boolean).join("\n");
}

function toStream(torrent) {
  const release = analyzeRelease(torrent.title);
  const stream = {
    name: `TR4KER • ${release.qualityLabel}`,
    title: buildDescription(torrent, release),
    behaviorHints: {
      bingeGroup: `tr4ker-${release.quality}-${release.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      notWebReady: true
    }
  };

  if (torrent.infoHash) {
    stream.infoHash = torrent.infoHash;
  } else if (torrent.downloadUrl) {
    stream.url = torrent.downloadUrl;
  }
  return stream;
}

function ranking(torrent) {
  const release = analyzeRelease(torrent.title);
  return release.score * 100000 + Math.max(0, torrent.seeders) * 100 + Math.min(torrent.size / 1024 ** 3, 99);
}

async function getStreams({ apikey, quality, type, id }) {
  if (!apikey || !/^tr4k_[A-Za-z0-9]+$/.test(apikey)) {
    throw new Error("Clé API TR4KER invalide");
  }
  if (!new Set(["4k", "1080p", "720p", "all"]).has(quality)) {
    throw new Error("Qualité invalide");
  }

  let torrents;
  if (type === "movie") torrents = await searchMovie(apikey, id);
  else if (type === "series") torrents = await searchSeries(apikey, id);
  else return { streams: [] };

  const seen = new Set();
  const streams = torrents
    .filter((torrent) => matchesQuality(torrent.title, quality))
    .filter((torrent) => torrent.seeders > 0)
    .sort((a, b) => ranking(b) - ranking(a))
    .filter((torrent) => {
      const key = torrent.infoHash || torrent.downloadUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESULTS)
    .map(toStream);

  return { streams };
}

module.exports = { getStreams };
