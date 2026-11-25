const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hash = 'a'.repeat(40);
const item = (title) => ({title, attr: [{name: 'infohash', value: hash}], enclosure: {url: 'https://tr4ker.net/download/42?apikey=dummy'}});

function provider({primary = [], fallback = [], title = 'Archer', metadataError = false, trackerError = false} = {}) {
  const calls = [];
  let responseItems = [];
  const sandbox = {
    module: {exports: {}}, URL, Buffer, console: {error() {}, log() {}},
    process: {env: {TRACKER_PROXY_URL: 'https://relay.invalid/tracker/'}},
    require(name) {
      if (name === 'axios') return {get: async (url, options) => {
        calls.push({url, params: options?.params});
        if (url.includes('/meta/')) {
          if (metadataError) throw new Error('Metadata unavailable');
          return {data: {meta: {name: title}}};
        }
        if (trackerError) throw new Error('Tracker unavailable');
        responseItems = options.params.q ? fallback : primary;
        return {data: 'mocked RSS'};
      }};
      assert.equal(name, 'fast-xml-parser');
      return {XMLParser: class {parse() {return {rss: {channel: {item: responseItems}}};}}};
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../addon/torznab.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports.trackerUrl = getPlaybackTrackerUrl;', sandbox);
  return {api: sandbox.module.exports, calls};
}

async function run() {
  const checks = [];
  async function check(name, action) {await action(); checks.push(name);}
  await check('movie IMDb first, no metadata or text query when found', async () => {
    const {api, calls} = provider({primary: [item('The.Odyssey.2026.1080p')]});
    assert.equal((await api.searchMovie(' dummy ', {imdbid: 'tt33764258'})).length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://tr4ker.net/api/torznab');
    assert.equal(calls[0].params.t, 'movie');
    assert.equal(calls[0].params.apikey, 'dummy');
    assert.equal(calls[0].params.imdbid, 'tt33764258');
    assert.equal(calls[0].params.q, undefined);
    assert.equal(calls[0].params.cat, '2000,2010,2040');
  });
  await check('movie empty IMDb result uses generic title search', async () => {
    const {api, calls} = provider({title: 'The Odyssey', fallback: [item('The.Odyssey.2026.1080p'), item('Other.Odyssey.2026.1080p')]});
    const results = await api.searchMovie('dummy', {imdbid: 'tt33764258'});
    assert.deepEqual(Array.from(results, x => x.title), ['The.Odyssey.2026.1080p']);
    assert.equal(calls.length, 3);
    assert.equal(calls[1].url, 'https://v3-cinemeta.strem.io/meta/movie/tt33764258.json');
    assert.equal(calls[2].params.t, 'search');
    assert.equal(calls[2].params.q, 'The Odyssey');
    assert.equal(calls[2].params.imdbid, undefined);
    assert.equal(calls[2].params.cat, calls[0].params.cat);
  });
  await check('series IMDb first, episode and season pack filtering retained', async () => {
    const primary = ['Archer.S07E02.1080p', 'Archer.S07.COMPLETE.1080p', 'Archer.S07E03.1080p', 'Archer.S08.COMPLETE.1080p'].map(item);
    const {api, calls} = provider({primary});
    const results = await api.searchSeries('dummy', {imdbid: 'tt1486217'}, 7, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.t, 'tvsearch');
    assert.equal(calls[0].params.imdbid, 'tt1486217');
    assert.equal(calls[0].params.q, undefined);
    assert.equal(calls[0].params.season, 7);
    assert.equal(calls[0].params.ep, undefined);
    assert.equal(calls[0].params.cat, undefined);
    assert.deepEqual(Array.from(results, x => x.seasonPack), [false, true]);
    assert.equal(results[1].requestedEpisode, 2);
    assert.equal(results[1].downloadUrl, primary[1].enclosure.url);
  });
  await check('series fallback excludes Arrow and preserves episode selection', async () => {
    const fallback = ['Archer.S07.MULTI.1080p', 'Arrow.S07.MULTI.1080p', 'Archery.S07.1080p', 'Archer.S07E02.1080p', 'Archer.S07E03.1080p'].map(item);
    const {api, calls} = provider({fallback});
    const results = await api.searchSeries('dummy', {imdbid: 'tt1486217'}, 7, 2);
    assert.deepEqual(Array.from(results, x => x.title), ['Archer.S07.MULTI.1080p', 'Archer.S07E02.1080p']);
    assert.equal(calls[1].url, 'https://v3-cinemeta.strem.io/meta/series/tt1486217.json');
    assert.equal(calls[2].params.t, 'tvsearch');
    assert.equal(calls[2].params.q, 'Archer');
    assert.equal(calls[2].params.imdbid, undefined);
    assert.equal(calls[2].params.season, 7);
    assert.equal(calls[2].params.ep, undefined);
  });
  await check('title normalization accepts punctuation case and accents', async () => {
    const {api} = provider({title: 'L’Odyssée', fallback: [item('L.Odyssee.2026.1080p'), item('L.OdysseeExtra.2026.1080p')]});
    assert.equal((await api.searchMovie('dummy', {imdbid: 'tt1'})).length, 1);
  });
  await check('nonempty season search does not fallback for an unavailable episode', async () => {
    const {api, calls} = provider({primary: [item('Archer.S07E03.1080p')]});
    assert.equal((await api.searchSeries('dummy', {imdbid: 'tt1486217'}, 7, 2)).length, 0);
    assert.equal(calls.length, 1);
  });
  await check('title cache is shared per media identity and separated by type', async () => {
    const {api, calls} = provider();
    await api.searchMovie('dummy', {imdbid: 'tt1234'});
    await api.searchMovie('dummy', {imdbid: 'tt1234'});
    await api.searchSeries('dummy', {imdbid: 'tt1234'}, 1, 2);
    assert.equal(calls.filter(x => x.url.includes('/meta/movie/')).length, 1);
    assert.equal(calls.filter(x => x.url.includes('/meta/series/')).length, 1);
  });
  await check('metadata failures do not run an empty query and can retry', async () => {
    const {api, calls} = provider({metadataError: true});
    await api.searchMovie('dummy', {imdbid: 'tt1234'});
    await api.searchMovie('dummy', {imdbid: 'tt1234'});
    assert.equal(calls.filter(x => x.url.includes('/meta/')).length, 2);
    assert.equal(calls.filter(x => x.params?.q !== undefined).length, 0);
  });
  await check('missing metadata title does not run an empty query', async () => {
    const {api, calls} = provider({title: ''});
    assert.equal((await api.searchMovie('dummy', {imdbid: 'tt1234'})).length, 0);
    assert.equal(calls.length, 2);
  });
  await check('tracker errors propagate without text fallback', async () => {
    const {api, calls} = provider({trackerError: true});
    await assert.rejects(api.searchMovie('dummy', {imdbid: 'tt1234'}), /Tracker unavailable/);
    assert.equal(calls.length, 1);
  });
  await check('TMDB-only clients retain direct identifier search', async () => {
    const {api, calls} = provider();
    await api.searchMovie('dummy', {tmdbid: '42'});
    await api.searchSeries('dummy', {tmdbid: '43'}, 1, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].params.tmdbid, '42');
    assert.equal(calls[1].params.tmdbid, '43');
  });
  await check('missing key and invalid identifier make no requests', async () => {
    const {api, calls} = provider();
    assert.equal((await api.searchMovie('', {imdbid: 'tt1234'})).length, 0);
    assert.equal((await api.searchMovie('dummy', {imdbid: 'invalid'})).length, 0);
    assert.equal(calls.length, 0);
  });
  await check('private tracker relay is unchanged', async () => {
    const {api} = provider();
    assert.equal(api.trackerUrl('http://tk.tr4ker.net/passkey/announce?x=1'), 'https://relay.invalid/tracker/passkey/announce?x=1');
    assert.equal(api.trackerUrl('https://other.invalid/announce'), 'https://other.invalid/announce');
  });
  return {passed: checks.length, checks};
}
module.exports = {run};
if (require.main === module) run().then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error); process.exitCode = 1;});
