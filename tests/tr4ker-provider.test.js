const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const calls = [];
  let failMetadata = false;
  const hash = 'a'.repeat(40);
  const items = ['Example.S01E02.1080p', 'Example.S01.COMPLETE', 'Example.S01E03', 'Example.S02.COMPLETE'].map(title => ({title, attr: [{name: 'infohash', value: hash}], enclosure: {url: 'https://tr4ker.net/download/42?apikey=dummy'}}));
  const sandbox = {
    module: {exports: {}}, URL, Buffer, console: {error() {}, log() {}},
    process: {env: {TRACKER_PROXY_URL: 'https://relay.invalid/tracker/'}},
    require(name) {
      if (name === 'axios') return {get: async (url, options) => {
        calls.push({url, options});
        if (url.includes('/meta/series/')) {
          if (failMetadata) throw new Error('unavailable');
          return {data: {meta: {name: 'Example'}}};
        }
        return {data: 'mocked RSS'};
      }};
      assert.equal(name, 'fast-xml-parser');
      return {XMLParser: class {parse() {return {rss: {channel: {item: items}}};}}};
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../addon/torznab.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports.trackerUrl = getPlaybackTrackerUrl;', sandbox);
  const api = sandbox.module.exports;
  await api.searchMovie('dummy', {imdbid: 'tt1234'});
  assert.equal(calls[0].url, 'https://tr4ker.net/api/torznab');
  assert.equal(calls[0].options.params.cat, '2000,2010,2040');
  const releases = await api.searchSeries('dummy', {imdbid: 'tt1234'}, 1, 2);
  const params = calls.at(-1).options.params;
  assert.equal(params.q, 'Example');
  assert.equal(params.season, 1);
  assert.equal(params.ep, undefined);
  assert.equal(params.cat, undefined);
  assert.deepEqual(Array.from(releases, item => item.seasonPack), [false, true]);
  assert.equal(releases[1].requestedEpisode, 2);
  assert.equal(releases[1].downloadUrl, items[1].enclosure.url);
  await api.searchSeries('dummy', {imdbid: 'tt1234'}, 1, 2);
  assert.equal(calls.filter(call => call.url.includes('/meta/series/')).length, 1);
  failMetadata = true;
  await api.searchSeries('dummy', {imdbid: 'tt5678'}, 1, 2);
  assert.equal(calls.at(-1).options.params.imdbid, 'tt5678');
  assert.equal(calls.at(-1).options.params.q, undefined);
  await api.searchSeries('dummy', {tmdbid: '42'}, 1, 2);
  assert.equal(calls.at(-1).options.params.tmdbid, '42');
  assert.equal(api.trackerUrl('http://tk.tr4ker.net/passkey/announce?x=1'), 'https://relay.invalid/tracker/passkey/announce?x=1');
  assert.equal(api.trackerUrl('https://other.invalid/announce'), 'https://other.invalid/announce');
  const previous = calls.length;
  assert.equal((await api.searchMovie('', {imdbid: 'tt1234'})).length, 0);
  assert.equal(calls.length, previous);
  return {passed: 8, checks: ['TR4KER endpoint and film categories', 'series title search', 'episode and season packs', 'original torrent URL', 'title cache', 'IMDb/TMDB fallback', 'private tracker relay', 'missing key']};
}
module.exports = {run};
if (require.main === module) run().then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error); process.exitCode = 1;});
