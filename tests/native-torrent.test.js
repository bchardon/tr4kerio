const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function run() {
  let downloads = 0;
  const release = {
    title: "Example.S01.COMPLETE.1080p.WEB-DL",
    infoHash: "a".repeat(40),
    downloadUrl: "https://tracker.invalid/download/42?apikey=dummy",
    size: 4000,
    seeders: 10,
    leechers: 2,
    requestedSeason: 1,
    requestedEpisode: 2,
    seasonPack: true
  };
  const torznab = {
    searchMovie: async () => [release],
    searchSeries: async () => [release],
    getPlaybackMetadata: async () => {
      downloads++;
      return {infoHash: release.infoHash, fileIdx: 2, fileName: "Example.S01E02.mkv", fileSize: 2000, sources: ["tracker:https://tracker.invalid/announce"]};
    }
  };
  const sandbox = {module: {exports: {}}, require: (name) => {
    assert.equal(name, "./torznab"); return torznab;
  }, process: {env: {}}, URL, console: {log() {}, error() {}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../addon/addon.js"), "utf8"), sandbox);
  const getStreams = sandbox.module.exports.getStreams;
  const params = {apikey: "dummy", quality: "1080p", type: "series", id: "tt1234567:1:2", mode: "native"};
  const native = await getStreams(params);
  assert.equal(native.streams.length, 1);
  assert.equal(downloads, 0, "Listing native sources must not download torrent metadata");
  assert.equal(native.streams[0].torrent.url, release.downloadUrl);
  assert.equal(native.streams[0].torrent.season, 1);
  assert.equal(native.streams[0].torrent.episode, 2);
  assert.equal(native.streams[0].infoHash, release.infoHash);
  assert.equal(native.streams[0].sources, undefined, "Native sources preserve the embedded trackers");
  assert.equal(native.streams[0].fileIdx, undefined);
  const legacy = await getStreams({...params, mode: "https"});
  assert.equal(downloads, 1);
  assert.equal(legacy.streams[0].torrent, undefined);
  assert.equal(legacy.streams[0].fileIdx, 2);
  assert.equal(legacy.streams[0].sources.length, 1);
  release.downloadUrl = "file:///etc/passwd";
  assert.equal((await getStreams(params)).streams.length, 0);
  assert.equal((await getStreams({...params, apikey: ""})).streams.length, 0);
  return {passed: 5, checks: ["lazy native sources", "episode selectors", "legacy compatibility", "invalid URL rejection", "missing configuration"]};
}

module.exports = {run};
if (require.main === module) run().then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error(error); process.exitCode = 1;
});
