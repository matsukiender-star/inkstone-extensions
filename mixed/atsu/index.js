const SITE_BASE = 'https://atsu.moe';
const API_BASE = `${SITE_BASE}/api`;
const SEARCH_PATH = '/collections/manga/documents/search';
const CDN_BASE = 'https://cdn.atsu.moe';
const PAGE_SIZE = 40;
const CACHE_MS = 60000;

const BLOCKED_TAG_IDS = ['28', '35', '6121', '5516', '6779', '2190', '4075', '4731', '6608', '4455', '3636'];
const BLOCKED_TAG_NAME = /(^|[^a-z])(loli|lolicon|shota|shotacon)([^a-z]|$)/i;

function isBlockedTagName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'loli' || n === 'shota') return false;
  return BLOCKED_TAG_NAME.test(n);
}

const GENRES = [
  { id: '39', label: 'Action' },
  { id: '46', label: 'Adult' },
  { id: '37', label: 'Adventure' },
  { id: '180', label: 'Boys Love' },
  { id: '6', label: 'Comedy' },
  { id: '31', label: 'Drama' },
  { id: '36', label: 'Fantasy' },
  { id: '4', label: 'Girls Love' },
  { id: '10', label: 'Hentai' },
  { id: '45', label: 'Historical' },
  { id: '44', label: 'Horror' },
  { id: '29', label: 'Martial Arts' },
  { id: '32', label: 'Mystery' },
  { id: '18', label: 'Psychological' },
  { id: '9', label: 'Romance' },
  { id: '1', label: 'Sci-Fi' },
  { id: '7', label: 'Slice of Life' },
  { id: '41', label: 'Smut' },
  { id: '22', label: 'Supernatural' },
  { id: '19', label: 'Thriller' },
  { id: '5', label: 'Tragedy' },
];
const GENRE_NAMES = new Map(GENRES.map((g) => [g.id, g.label]));
const EXPLICIT_GENRE_IDS = ['10', '41'];
const SUGGESTIVE_GENRE_IDS = ['46'];

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', home: 'recentlyUpdated' },
  { id: 'hot', name: 'Hot Updates', home: 'hotUpdates' },
  { id: 'popular', name: 'Popular', sort: 'views:desc' },
  { id: 'trending', name: 'Trending', sort: 'trending:desc' },
  { id: 'new', name: 'New Additions', sort: 'dateAdded:desc' },
  { id: 'top', name: 'Top Rated', sort: 'mbRating:desc' },
];

const SEARCH_FIELDS =
  'id,title,authors,poster,posterMedium,medium,isAdult,status,mbContentRating,mbRating,genreIds,views,tagIds';
const FEED_TYPES = 'Manga,Manwha,Manhua,OEL,Other';
const FEED_RATINGS = 'Safe,Suggestive,Erotica,Pornographic';

function cleanText(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function parseJsonBody(text) {
  const body = String(text || '').trim();
  if (body.charAt(0) !== '<') return JSON.parse(body);
  const $ = cheerio.load(body);
  const pre = $('pre').first();
  return JSON.parse((pre.length ? pre.text() : $('body').text()).trim());
}

function cdnUrl(path) {
  if (!path) return undefined;
  const p = String(path);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.indexOf('/static/') === 0) return CDN_BASE + p;
  return `${CDN_BASE}/static/${p.replace(/^\/+/, '')}`;
}

function mediumOf(value) {
  return String(value || '') === 'Novel' ? 'novel' : 'comics';
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'canceled' || s === 'cancelled') return 'CANCELLED';
  return 'UNKNOWN';
}

function ageRatingFor(isAdult, contentRating, genreIds) {
  let age = 0;
  if (contentRating === 'Suggestive') age = 16;
  if (contentRating === 'Erotica' || contentRating === 'Pornographic') age = 18;
  const ids = (genreIds || []).map(String);
  if (ids.some((g) => SUGGESTIVE_GENRE_IDS.indexOf(g) !== -1) && age < 16) age = 16;
  if (ids.some((g) => EXPLICIT_GENRE_IDS.indexOf(g) !== -1)) age = 18;
  if (isAdult) age = 18;
  return age;
}

function isBlockedIds(tagIds) {
  return (tagIds || []).some((t) => BLOCKED_TAG_IDS.indexOf(String(t)) !== -1);
}

function blockedFilter() {
  return `tagIds:!=[${BLOCKED_TAG_IDS.join(',')}]`;
}

function synopsisText(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .replace(/\\([-_*[\]().!#>+`~|{}])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toPartialManga(doc) {
  const genres = (doc.genreIds || []).map((g) => GENRE_NAMES.get(String(g))).filter(Boolean);
  const status = mapStatus(doc.status);
  const manga = {
    mangaId: String(doc.id),
    title: cleanText(doc.title) || String(doc.id),
    image: cdnUrl(doc.posterMedium || doc.poster),
    status,
    completed: status === 'COMPLETED',
    ageRating: ageRatingFor(doc.isAdult, doc.mbContentRating, doc.genreIds),
    webURL: `${SITE_BASE}/manga/${doc.id}`,
    medium: mediumOf(doc.medium),
  };
  const authors = (doc.authors || []).map(cleanText).filter(Boolean);
  if (authors.length) manga.author = authors.slice(0, 3).join(', ');
  if (genres.length) manga.tags = genres;
  if (typeof doc.mbRating === 'number' && doc.mbRating > 0) manga.rating = doc.mbRating;
  if (typeof doc.views === 'number' && doc.views > 0) manga.views = doc.views;
  return manga;
}

function mergeChapters(rows, scanlators, comics) {
  const rank = new Map();
  const names = new Map();
  scanlators.forEach((s, i) => {
    rank.set(s.id, i);
    names.set(s.id, cleanText(s.name));
  });
  const rankOf = (c) => (rank.has(c.scanlationMangaId) ? rank.get(c.scanlationMangaId) : 1000);
  const best = new Map();
  rows.forEach((c) => {
    if (!c || !c.id) return;
    if (comics && !(c.pageCount > 0)) return;
    const key = String(c.number);
    const cur = best.get(key);
    if (!cur || rankOf(c) < rankOf(cur) || (rankOf(c) === rankOf(cur) && (c.pageCount || 0) > (cur.pageCount || 0))) {
      best.set(key, c);
    }
  });
  const chapters = [];
  best.forEach((c) => {
    const number = Number(c.number);
    const title = cleanText(c.title);
    const chapter = {
      id: String(c.id),
      chapterId: String(c.id),
      name: title || `Chapter ${c.number}`,
      number: Number.isFinite(number) ? number : 0,
    };
    const group = names.get(c.scanlationMangaId);
    if (group) chapter.group = group;
    if (typeof c.createdAt === 'number' && c.createdAt > 0) chapter.time = c.createdAt;
    chapters.push(chapter);
  });
  chapters.sort((a, b) => b.number - a.number);
  return chapters;
}

class Source {
  constructor() {
    this._pages = new Map();
    this._chapters = new Map();
    this._docs = new Map();
    this._novels = new Set();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    const wanted = request && request.medium ? String(request.medium) : '';
    const medium = wanted === 'novel' ? 'Novel' : wanted === 'comics' ? 'Comic' : '';
    const query = cleanText(request && request.title);
    const ids = (list) => (list || []).map((t) => t && String(t.id)).filter((id) => /^\d+$/.test(id || ''));
    const include = ids(request && request.includedTags);
    const exclude = ids(request && request.excludedTags);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[2];

    if (feed.home && !query && include.length === 0 && exclude.length === 0) {
      return this._homeFeed(feed, medium, metadata);
    }

    const page = Math.max(1, (metadata && metadata.page) || 1);
    const filters = [blockedFilter()];
    if (medium) filters.push(`medium:=${medium}`);
    include.forEach((g) => filters.push(`genreIds:=${g}`));
    if (exclude.length) filters.push(`genreIds:!=[${exclude.join(',')}]`);
    const sort = query ? '' : feed.sort || 'views:desc';
    const found = await this._search({ q: query || '*', filters, sort, page, perPage: PAGE_SIZE });
    const results = found.docs.filter((d) => !isBlockedIds(d.tagIds)).map(toPartialManga);
    const hasNext = page * PAGE_SIZE < found.total && found.docs.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const [mp, doc] = await Promise.all([this._page(mangaId), this._doc(mangaId)]);
    const genreIds = (mp.genres || []).map((g) => String(g.id));
    const status = mapStatus(mp.status);
    const authors = [];
    (mp.authors || []).forEach((a) => {
      const name = cleanText(a && a.name);
      if (name && authors.indexOf(name) === -1) authors.push(name);
    });
    const tags = (mp.genres || []).map((g) => cleanText(g.name)).filter(Boolean);
    (mp.tags || []).forEach((t) => {
      const name = cleanText(t && t.name);
      if (name && (t.weight === 'Defining' || t.weight === 'Core') && tags.indexOf(name) === -1) tags.push(name);
    });
    const poster = mp.poster || {};
    const info = {
      mangaId: String(mp.id),
      title: cleanText(mp.title) || String(mp.id),
      image: cdnUrl(poster.largeImage || poster.mediumImage || poster.image),
      status,
      completed: status === 'COMPLETED',
      ageRating: ageRatingFor(mp.isAdult, doc && doc.mbContentRating, genreIds),
      webURL: `${SITE_BASE}/manga/${mp.id}`,
      medium: mediumOf(mp.medium),
      desc: synopsisText(mp.synopsis) || undefined,
    };
    if (authors.length) info.author = authors.slice(0, 3).join(', ');
    if (tags.length) info.tags = tags.slice(0, 20);
    if (typeof mp.avgRating === 'number' && mp.avgRating > 0) info.rating = mp.avgRating;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const [mp, rows] = await Promise.all([this._page(mangaId), this._allChapters(mangaId)]);
    return mergeChapters(rows, mp.scanlators || [], mediumOf(mp.medium) === 'comics');
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = encodeURIComponent(mangaId);
    const chapter = encodeURIComponent(chapterId);
    const novelFirst = this._novels.has(mangaId);

    if (!novelFirst) {
      const json = await this._get(`${API_BASE}/read/chapter?mangaId=${id}&chapterId=${chapter}`);
      const read = (json && json.readChapter) || {};
      const pages = (Array.isArray(read.pages) ? read.pages : [])
        .slice()
        .sort((a, b) => (a.number || 0) - (b.number || 0))
        .map((p) => cdnUrl(p && p.image))
        .filter(Boolean);
      if (pages.length > 0) return { id: chapterId, mangaId, pages };
    }

    let json = null;
    try {
      json = await this._get(`${API_BASE}/read/novelChapter?mangaId=${id}&chapterId=${chapter}`);
    } catch (e) {
      if (!/HTTP 404/.test(String(e && e.message))) throw e;
    }
    const read = (json && json.readNovelChapter) || {};
    const lines = (Array.isArray(read.paragraphs) ? read.paragraphs : []).map(cleanText).filter(Boolean);
    const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (lines.length > 1 && squash(lines[0]) === squash(read.title)) lines.shift();
    if (lines.length > 0) return { id: chapterId, mangaId, pages: [], text: lines.join('\n\n') };

    if (novelFirst) {
      const comic = await this._get(`${API_BASE}/read/chapter?mangaId=${id}&chapterId=${chapter}`);
      const pages = ((comic && comic.readChapter && comic.readChapter.pages) || [])
        .map((p) => cdnUrl(p && p.image))
        .filter(Boolean);
      if (pages.length > 0) return { id: chapterId, mangaId, pages };
    }
    throw new Error('Atsumaru has no pages or text for this chapter');
  }

  async _homeFeed(feed, medium, metadata) {
    const offset = Math.max(0, (metadata && metadata.offset) || 0);
    const mediums = medium || 'Comic,Novel';
    const json = await this._get(
      `${API_BASE}/home2/${feed.home}?offset=${offset}&limit=${PAGE_SIZE}` +
        `&types=${FEED_TYPES}&mediums=${mediums}&contentRatings=${FEED_RATINGS}` +
        `&excludedTags=${BLOCKED_TAG_IDS.join(',')}`
    );
    const items = Array.isArray(json && json.items) ? json.items : [];
    const wanted = items.map((i) => i && i.id).filter(Boolean);
    const byId = new Map();
    if (wanted.length) {
      const found = await this._search({
        q: '*',
        filters: [`id:=[${wanted.map((id) => `\`${id}\``).join(',')}]`, blockedFilter()],
        sort: '',
        page: 1,
        perPage: wanted.length,
      });
      found.docs.forEach((d) => {
        if (!isBlockedIds(d.tagIds)) byId.set(String(d.id), d);
      });
    }
    const results = [];
    const seen = new Set();
    wanted.forEach((id) => {
      const doc = byId.get(String(id));
      if (doc && !seen.has(doc.id)) {
        seen.add(doc.id);
        results.push(toPartialManga(doc));
      }
    });
    return { results, metadata: items.length >= PAGE_SIZE ? { offset: offset + items.length } : undefined };
  }

  async _search(opts) {
    const params = [
      `q=${encodeURIComponent(opts.q)}`,
      'query_by=title,englishTitle,otherNames,authors,acronyms',
      'query_by_weights=4,3,2,2,1',
      'num_typos=4,3,2,1,0',
      'prefix=true,true,true,true,false',
      'infix=off,off,fallback,off,off',
      `include_fields=${SEARCH_FIELDS}`,
      `filter_by=${encodeURIComponent(opts.filters.join(' && '))}`,
      `page=${opts.page}`,
      `per_page=${opts.perPage}`,
    ];
    if (opts.sort) params.push(`sort_by=${encodeURIComponent(opts.sort)}`);
    const json = await this._get(`${SITE_BASE}${SEARCH_PATH}?${params.join('&')}`);
    const docs = (Array.isArray(json && json.hits) ? json.hits : []).map((h) => h && h.document).filter(Boolean);
    return { docs, total: (json && json.found) || 0 };
  }

  _doc(mangaId) {
    const hit = this._docs.get(mangaId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = this._search({
      q: '*',
      filters: [`id:=\`${String(mangaId).replace(/`/g, '')}\``],
      sort: '',
      page: 1,
      perPage: 1,
    })
      .then((found) => found.docs[0] || null)
      .catch(() => null);
    this._docs.set(mangaId, { at: Date.now(), promise });
    return promise;
  }

  _page(mangaId) {
    const hit = this._pages.get(mangaId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = this._get(`${API_BASE}/manga/page?id=${encodeURIComponent(mangaId)}`)
      .then((json) => {
        const mp = json && json.mangaPage;
        if (!mp) throw new Error('Atsumaru: no such title');
        const blocked =
          (mp.tags || []).some((t) => t && (isBlockedIds([t.id]) || isBlockedTagName(t.name))) ||
          (mp.genres || []).some((g) => g && isBlockedTagName(g.name));
        if (blocked) throw new Error('This title is not available in this source.');
        if (mediumOf(mp.medium) === 'novel') this._novels.add(mangaId);
        return mp;
      })
      .catch((e) => {
        this._pages.delete(mangaId);
        throw e;
      });
    this._pages.set(mangaId, { at: Date.now(), promise });
    return promise;
  }

  _allChapters(mangaId) {
    const hit = this._chapters.get(mangaId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = this._get(`${API_BASE}/manga/allChapters?mangaId=${encodeURIComponent(mangaId)}`)
      .then((json) => (Array.isArray(json && json.chapters) ? json.chapters : []))
      .catch((e) => {
        this._chapters.delete(mangaId);
        throw e;
      });
    this._chapters.set(mangaId, { at: Date.now(), promise });
    return promise;
  }

  async _get(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      let reason = '';
      try {
        const body = parseJsonBody(response.data);
        reason = ` (${(body && (body.message || (body.error && (body.error.message || body.error)))) || ''})`;
      } catch (e) {
        reason = ` (${cleanText(response.data).slice(0, 80)})`;
      }
      throw new Error(`Atsumaru HTTP ${response.status}${reason}`);
    }
    return parseJsonBody(response.data);
  }
}

module.exports = { Source };
