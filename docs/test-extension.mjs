import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as cheerio from 'cheerio/slim';

const [file, searchTerm] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node test-extension.mjs <path/to/index.js> [search term]');
  process.exit(1);
}

const tally = { pass: 0, fail: 0, warn: 0 };
const say = (kind, label, detail = '') => {
  tally[kind]++;
  console.log(`${kind.toUpperCase().padEnd(4)}  ${label}${detail ? `  (${detail})` : ''}`);
  return kind === 'pass';
};
const check = (ok, label, detail) => say(ok ? 'pass' : 'fail', label, detail);
let warnedRating = false;
const warnIgnoredRating = (what) => {
  if (warnedRating) return;
  warnedRating = true;
  say('warn', `${what} set contentRating, which Boundless ignores`, 'to rate titles one by one, set ageRating to a minimum age such as 0, 16 or 18');
};
let skippedInApp = false;
const finish = () => {
  console.log(`\n${tally.pass} passed, ${tally.fail} failed, ${tally.warn} warnings.`);
  if (tally.fail) console.log('Not ready yet.');
  else if (skippedInApp) console.log('No problems found. The parts that need Boundless were skipped, so try those in the app.');
  else console.log('Compatible, and it fetches real results.');
  process.exit(tally.fail ? 1 : 0);
};
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
const pickQuery = (title) => {
  const parts = String(title ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => [...w].length >= 3);
  const first = parts[0] ?? String(title ?? '').trim();
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(first) ? [...first].slice(0, 4).join('') : first;
};
const gated = (chapter) => /\b(locked|paid|premium|join to read|early access|coins?)\b/i.test(chapter.name ?? '');

const requests = [];
const App = {
  createRequestManager: (options = {}) => {
    // Boundless spaces a manager's requests by its declared rateLimit (the stricter of
    // requestsPerSecond and requestsPerMinute), so the test does the same.
    const limit = options.rateLimit ?? {};
    const gaps = [limit.requestsPerSecond > 0 ? 1000 / limit.requestsPerSecond : 0, limit.requestsPerMinute > 0 ? 60000 / limit.requestsPerMinute : 0];
    const gap = Math.max(...gaps);
    let nextSlot = 0;
    return {
    async schedule(request) {
      if (gap > 0) {
        const wait = Math.max(0, nextSlot - Date.now());
        nextSlot = Math.max(nextSlot, Date.now()) + gap;
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      requests.push(new URL(request.url).hostname);
      let res;
      try {
        res = await fetch(request.url, {
          method: request.method || 'GET',
          headers: request.headers,
          body: request.body,
        });
      } catch (error) {
        throw new Error(`network error: ${error.cause?.code ?? error.cause?.message ?? error.message}`);
      }
      return { status: res.status, headers: Object.fromEntries(res.headers), data: await res.text() };
    },
    };
  },
  createRequest: (options) => options,
  getSourceSetting: () => undefined,
  createSourceStateManager: () => {
    const saved = new Map();
    return { store: async (k, v) => void saved.set(k, v), retrieve: async (k) => saved.get(k) };
  },
  base64Encode: (s) => Buffer.from(s).toString('base64'),
  base64Decode: (s) => Buffer.from(s, 'base64').toString(),
  executeInWebView: async () => {
    throw new Error('App.executeInWebView only works inside Boundless. Test that part in the app.');
  },
};

const code = readFileSync(file, 'utf8');

console.log('Compatibility (no network)\n');

const banned = ['fetch', 'XMLHttpRequest', 'URL', 'URLSearchParams', 'setTimeout', 'setInterval', 'btoa', 'atob', 'TextDecoder', 'document', 'DOMParser', 'structuredClone', 'require'];
const hits = [];
code.split('\n').forEach((line, i) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  for (const name of banned) {
    if (new RegExp(`(^|[^\\w.$])${name}\\s*[(.]|new ${name}\\b`).test(line)) hits.push(`${name} on line ${i + 1}`);
  }
});
if (hits.length) {
  say('warn', 'uses something Boundless does not provide', `${hits.slice(0, 4).join(', ')}. Fine inside a string for a WebView script, a bug anywhere else`);
} else {
  say('pass', 'no fetch, URL, setTimeout, document or require in the code');
}
const usesWebView = code.includes('executeInWebView');
if (usesWebView) {
  say('warn', 'uses App.executeInWebView, which only runs inside Boundless. Test that part in the app');
}

let CryptoJS;
try {
  CryptoJS = (await import('crypto-js')).default;
} catch {
  CryptoJS = undefined;
}
const sandbox = { module: { exports: {} }, App, cheerio, ...(CryptoJS ? { CryptoJS } : {}), console };
sandbox.exports = sandbox.module.exports;
try {
  vm.runInNewContext(code, sandbox, { filename: file });
  say('pass', 'loads without errors in a bare Boundless-style sandbox');
} catch (error) {
  check(false, 'loads without errors in a bare Boundless-style sandbox', error.message);
  finish();
}
const Source = sandbox.module.exports.Source;
if (!check(typeof Source === 'function', 'exports a Source class', 'module.exports = { Source }')) finish();
const source = new Source();

const anime = typeof source.getVideos === 'function';
for (const method of ['getSearchResults', 'getMangaDetails', 'getChapters', anime ? 'getVideos' : 'getChapterDetails']) {
  check(typeof source[method] === 'function', `has ${method}()`);
}

let feeds = [];
if (typeof source.getSourceFeeds === 'function') {
  const returned = source.getSourceFeeds();
  check(!(returned && typeof returned.then === 'function'), 'getSourceFeeds() is synchronous, not async');
  feeds = Array.isArray(returned) ? returned : [];
  check(feeds.every((f) => f.name && f.id !== undefined && f.id !== null), 'every feed has an id and a name', `${feeds.length} feeds`);
  if (feeds.some((f) => f.id === '')) say('warn', 'a feed has an empty id', 'it can work as the default feed, but a named id is safer');
}

const folder = path.resolve(path.dirname(file));
const listPath = [path.dirname(folder), path.dirname(path.dirname(folder))].map((dir) => path.join(dir, 'versioning.json')).find((candidate) => existsSync(candidate)) ?? path.join(path.dirname(folder), 'versioning.json');
let entry;
if (existsSync(listPath)) {
  const listing = JSON.parse(readFileSync(listPath, 'utf8'));
  entry = listing.sources?.find((s) => s.id === path.basename(folder));
  if (check(entry, 'has an entry in versioning.json', `id "${path.basename(folder)}"`)) {
    check(entry.name && /^\d+\.\d+\.\d+/.test(entry.version ?? ''), 'entry has a name and a version like 1.0.0');
    check(['comics', 'novel', 'both', 'anime'].includes(entry.medium), 'medium is comics, novel, both or anime', entry.medium);
    check((entry.medium === 'anime') === anime, 'an anime source has getVideos, and only an anime source', entry.medium);
    const typeFolder = path.basename(path.dirname(folder));
    const wantedFolder = { comics: 'comics', novel: 'novels', both: 'mixed', anime: 'anime' }[entry.medium];
    if (['comics', 'novels', 'mixed', 'anime'].includes(typeFolder)) check(typeFolder === wantedFolder, 'sits in the folder for its medium', `${typeFolder}/ holds it, ${wantedFolder}/ fits "${entry.medium}"`);
    check(['safe', 'mature', 'adult'].includes(entry.contentRating), 'contentRating is safe, mature or adult', entry.contentRating);
    check(isUrl(entry.website), 'website is a full URL');
    check(/^[a-z]{2,3}$/.test(entry.language ?? ''), 'language is a short code like en', entry.language);
    check(entry.description && entry.capabilities?.length, 'has a description and capabilities');
    if ((entry.description ?? '').length > 300) say('warn', 'description is long', `${entry.description.length} characters: keep the short shape (a line of types, a Catalog line, a Restrictions list) and put the rest in the file header and your report`);
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (entry.sha256) check(entry.sha256 === digest, 'sha256 matches the file', entry.sha256 === digest ? '' : 'run shasum -a 256 and update it');
    else say('warn', 'no sha256 yet', `shasum -a 256 gives ${digest.slice(0, 12)}...`);
  }
} else {
  say('warn', 'no versioning.json one or two folders up, so the listing checks were skipped');
}

console.log('\nLive results (real requests to the site)\n');

const withTimeout = (promise, ms = 60000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);
async function step(label, run) {
  const started = Date.now();
  try {
    const value = await withTimeout(run());
    return { value, took: `${((Date.now() - started) / 1000).toFixed(1)}s` };
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes('only works inside Boundless')) {
      skippedInApp = true;
      say('warn', `${label} needs Boundless, so it was skipped`);
    } else {
      say('fail', label, message.slice(0, 200));
    }
    return null;
  }
}

const browse = await step('browse', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, null));
if (browse) {
  const list = browse.value.results ?? [];
  if (usesWebView && list.length === 0) say('warn', 'browse returned nothing, expected if it needs Boundless (WebView)');
  else check(list.length > 0, 'browse returns titles', `${list.length} results in ${browse.took}`);
  check(list.every((r) => r.mangaId && r.title), 'every title has a mangaId and a title');
  check(list.every((r) => isUrl(r.image)), 'every cover is an absolute URL in "image"');
  if (list.some((r) => r.contentRating !== undefined && r.ageRating === undefined)) warnIgnoredRating('titles');
  if (list.some((r) => r.ageRating !== undefined)) {
    check(list.every((r) => r.ageRating === undefined || typeof r.ageRating === 'number'), 'ageRating is a number, a minimum age such as 0, 16 or 18');
  }
  if (browse.value.metadata) {
    const next = await step('browse page 2', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, browse.value.metadata));
    if (next) check(next.value.results?.[0]?.mangaId !== list[0]?.mangaId, 'page 2 differs from page 1');
  }
}

let genreCount = null;
if (typeof source.getSearchTags === 'function') {
  const tags = await step('genre list', () => source.getSearchTags());
  if (tags) {
    genreCount = tags.value.length;
    if (genreCount === 0) say('warn', 'genre list is empty', 'fine if the site has no working genre filter, but then do not declare "genres"');
    else if (tags.value.some((t) => Array.isArray(t.tags))) say('warn', 'genre list is grouped into sections', 'Boundless reads flat { id, label } entries, so return a flat list');
    else check(tags.value.every((t) => t.id && t.label), 'genre list has ids and labels', `${genreCount} genres`);
  }
}

const query = searchTerm || pickQuery(browse?.value.results?.[0]?.title) || 'a';
const found = await step(`search "${query}"`, () => source.getSearchResults({ title: query }, null));
if (found) {
  const count = found.value.results?.length ?? 0;
  if (usesWebView && count === 0) say('warn', `search "${query}" returned nothing, expected if it needs Boundless (WebView)`);
  else check(count > 0, `search "${query}" returns titles`, `${count} results in ${found.took}`);
}

const nothing = await step('search for a word that matches nothing', () => source.getSearchResults({ title: 'zzqxkvjwpl' }, null));
if (nothing) {
  const empty = nothing.value?.results;
  check(Array.isArray(empty), 'a search that matches nothing returns a list, not an error', 'some sites answer 404 for no match: treat that as an empty list');
  if (Array.isArray(empty) && empty.length > 0) say('warn', `a nonsense search still returned ${empty.length} titles`, 'fine if the site does fuzzy matching, a bug if the query is being ignored (check the parameter name)');
}

for (const item of (found?.value.results ?? []).slice(0, 2)) {
  console.log(`\n${item.title}`);
  const details = await step('details', () => source.getMangaDetails(item.mangaId));
  if (details) {
    const info = details.value.mangaInfo;
    check(info && (info.desc !== undefined || info.summary !== undefined), 'details have a description (desc or summary)', details.took);
    check(['ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED', 'UNKNOWN'].includes(info?.status), 'status is an allowed value', info?.status);
    check([info?.title, info?.author, info?.desc, info?.summary].every((v) => v === undefined || v === null || typeof v === 'string'), 'title, author and description are plain strings', 'join several author names into one string, the app throws on a list');
    if (info && info.contentRating !== undefined && info.ageRating === undefined) warnIgnoredRating('details');
  }
  const chapters = await step('chapters', () => source.getChapters(item.mangaId));
  if (!chapters) continue;
  const list = chapters.value ?? [];
  check(list.length > 0, 'chapter list is not empty', `${list.length} chapters in ${chapters.took}`);
  check(list.every((c) => c.id), 'every chapter has an id');
  check(list.every((c) => c.time === undefined || c.time > 1e11), 'chapter times are in milliseconds');
  check(new Set(list.map((c) => String(c.id))).size === list.length, 'every chapter id is unique', 'a chapter that appears on two pages of the site should be listed once');
  const wrongType = (v, type) => v !== undefined && v !== null && typeof v !== type;
  check(
    list.every((c) => !wrongType(c.name, 'string') && !wrongType(c.group, 'string') && !wrongType(c.volume, 'string') && !wrongType(c.number, 'number') && !wrongType(c.time, 'number')),
    'chapter fields have the types Boundless casts to',
    'name, group and volume are strings; number and time are numbers, not "12"',
  );
  const tryPlay = async (chapter, label, started) => {
    const videos = await withTimeout(source.getVideos(item.mangaId, chapter.id));
    if (!Array.isArray(videos) || videos.length === 0 || !videos.every((v) => isUrl(v.url))) return { ok: false, label, detail: 'getVideos gave no video with a full URL' };
    const first = videos[0];
    const answer = await withTimeout(fetch(first.url, { headers: first.headers ?? {} }), 30000);
    const body = answer.ok ? await answer.text() : '';
    const plays = answer.ok && (body.startsWith('#EXTM3U') || (answer.headers.get('content-type') ?? '').startsWith('video/'));
    const subtitles = (first.subtitles ?? []).length;
    const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
    const skip = first.intro ? `, intro ${Math.round(first.intro.start / 1000)}s to ${Math.round(first.intro.end / 1000)}s` : '';
    return { ok: plays, label, detail: plays ? `${videos.length} video, ${subtitles} subtitle tracks${skip}, in ${took}` : `the stream answered ${answer.status}` };
  };
  const tryOpen = async (chapter) => {
    const label = `chapter "${chapter.name ?? chapter.id}"`;
    const started = Date.now();
    try {
      if (anime) return await tryPlay(chapter, label, started);
      const read = await withTimeout(source.getChapterDetails(item.mangaId, chapter.id));
      const isText = Array.isArray(read.pages) && read.pages.length === 0 && read.text;
      const isImages = read.pages?.length > 0 && read.pages.every(isUrl);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      return { ok: Boolean(isText || isImages), label, detail: isText ? 'text' : `${read.pages?.length ?? 0} pages in ${took}` };
    } catch (error) {
      const message = String(error.message ?? error);
      if (message.includes('only works inside Boundless')) return { skipped: true, label, detail: message };
      return { ok: false, label, detail: message.slice(0, 200) };
    }
  };
  const readable = list.filter((c) => !gated(c));
  if (readable.length && readable.length < list.length) say('warn', `${list.length - readable.length} locked or paid chapters were skipped`, 'timed locks should end in "(Locked, unlocks in 5h 3m)" so the app shows a countdown');
  const pool = readable.length ? readable : list;
  const attempts = [];
  for (const chapter of pool.slice(0, 4)) {
    attempts.push(await tryOpen(chapter));
    if (attempts.at(-1).ok || attempts.at(-1).skipped) break;
  }
  if (attempts.length === 0) continue;
  const [first] = attempts;
  const opened = attempts.at(-1);
  if (first.skipped) {
    skippedInApp = true;
    say('warn', 'opening a chapter needs Boundless, so it was skipped');
    continue;
  }
  if (first.ok) {
    say('pass', `${first.label} opens`, first.detail);
  } else if (opened.ok) {
    say('warn', `${first.label} did not open (${first.detail}), maybe locked or not published yet`);
    say('pass', `${opened.label} opens`, opened.detail);
  } else {
    say('fail', `none of the ${attempts.length} newest chapters opened`, `${first.label}: ${first.detail}`);
  }
  if (pool.length > 1) {
    const oldest = await tryOpen(pool.at(-1));
    check(oldest.ok, `${oldest.label} opens`, oldest.detail);
  }
}

if (entry && genreCount !== null && browse && !usesWebView) {
  const declares = entry.capabilities?.includes('genres');
  if (declares && genreCount === 0) say('fail', 'declares "genres" in versioning.json but the genre list is empty');
  if (!declares && genreCount > 0) say('warn', 'has a working genre list but versioning.json does not declare "genres"');
}

const hostsUsed = [...new Set(requests)];
console.log(`\nMade ${requests.length} requests to ${hostsUsed.join(', ') || 'nothing'}.`);
if (entry?.hosts?.length) {
  const allowed = (host) => entry.hosts.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p));
  const blocked = hostsUsed.filter((h) => !allowed(h));
  check(blocked.length === 0, 'every host it called is in "hosts"', blocked.join(', '));
} else if (entry) {
  say('warn', 'no "hosts" list declared, so nothing limits where it can connect (recommended)');
}

finish();
