const SITE_BASE = 'https://mangak.io';
const API_BASE = 'https://api.mangak.io';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const PAGE_SIZE = 24;
const COVER_REFERER = SITE_BASE + '/';

const EXPLICIT_GENRES = new Set(['hentai', 'smut', 'adult']);
const SUGGESTIVE_GENRES = new Set(['mature', 'ecchi']);

const FEEDS = [
  { id: 'popular', name: 'Most Followed' },
  { id: 'latest', name: 'Latest Updated' },
  { id: 'newest', name: 'Recently Added' },
  { id: 'rating', name: 'Highest Rating' },
  { id: 'views', name: 'Most Viewed' },
  { id: 'views_today', name: 'Trending Today' },
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED';
  return 'UNKNOWN';
}

function isBlockedTagName(name) {
  const n = cleanText(name).toLowerCase();
  return /loli|shota/.test(n) && n !== 'loli' && n !== 'shota';
}

function ageRatingFor(isAdult, contentRating, genres) {
  const slugs = (genres || []).map((g) => String((g && g.slug) || '').toLowerCase());
  let age = 0;
  if (contentRating === 'suggestive') age = 16;
  if (slugs.some((s) => SUGGESTIVE_GENRES.has(s))) age = Math.max(age, 16);
  if (contentRating === 'erotica' || contentRating === 'pornographic') age = 18;
  if (slugs.some((s) => EXPLICIT_GENRES.has(s))) age = 18;
  if (isAdult === true) age = 18;
  return age;
}

function toPartialManga(item) {
  const manga = {
    mangaId: String(item.id),
    title: cleanText(item.name) || String(item.id),
    image: item.cover || undefined,
    referer: COVER_REFERER,
    status: mapStatus(item.status),
    ageRating: ageRatingFor(item.is_adult, item.content_rating, item.genres),
    medium: 'comics',
    webURL: SITE_BASE + (item.url || '/'),
  };
  manga.completed = manga.status === 'COMPLETED';
  if (typeof item.rating === 'number' && item.rating > 0) manga.rating = Math.round(item.rating * 20) / 10;
  return manga;
}

class Source {
  constructor() {
    this._titles = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const json = await this._json('/genres');
      const items = (json.data && json.data.items) || [];
      return items.filter((g) => g && g.slug && g.name).map((g) => ({ id: g.slug, label: g.name }));
    } catch (e) {
      console.error('MangaK getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = cleanText((request && request.title) || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) ? request.feed : 'popular';
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const included = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const excluded = ((request && request.excludedTags) || []).map((t) => t && t.id).filter(Boolean);

    const params = { page, limit: PAGE_SIZE, sort: title ? undefined : feed };
    if (title) params.q = title;
    if (included.length) params.genres = included.join(',');
    if (excluded.length) params.exclude = excluded.join(',');

    let json;
    try {
      json = await this._json('/titles/search?' + qs(params));
    } catch (e) {
      if (page > 1 && /maximum browsable depth/i.test(String(e && e.message))) return { results: [], metadata: undefined };
      throw e;
    }
    const data = json.data || {};
    const list = Array.isArray(data.items) ? data.items : [];
    const more = !!(data.pagination && data.pagination.has_next);
    return {
      results: list.filter((i) => i && i.id).map(toPartialManga),
      metadata: more && list.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const t = await this._title(mangaId);
    const tagNames = (t.tags || []).map((x) => x && x.name).filter(Boolean);
    const genreNames = (t.genres || []).map((x) => x && x.name).filter(Boolean);
    if (tagNames.concat(genreNames).some(isBlockedTagName)) {
      throw new Error('MangaK does not serve this title: it carries a Lolicon or Shotacon style tag');
    }
    const people = [];
    []
      .concat(Array.isArray(t.authors) ? t.authors : [])
      .concat(Array.isArray(t.artists) ? t.artists : [])
      .forEach((p) => {
        const n = cleanText(p && p.name);
        if (n && people.indexOf(n) < 0) people.push(n);
      });
    const status = mapStatus(t.status);
    const info = {
      mangaId: String(t.id),
      title: cleanText(t.name) || String(t.id),
      image: t.cover || undefined,
      referer: COVER_REFERER,
      author: people.join(', ') || undefined,
      desc: typeof t.summary === 'string' ? t.summary.replace(/\r\n?/g, '\n').replace(/\\([-_*[\]().!#>+`~|{}])/g, '$1').trim() || undefined : undefined,
      status,
      completed: status === 'COMPLETED',
      tags: genreNames.concat(tagNames.filter((n) => genreNames.indexOf(n) < 0)),
      ageRating: ageRatingFor(t.is_adult, t.content_rating, t.genres),
      medium: 'comics',
      webURL: SITE_BASE + (t.url || '/'),
    };
    if (typeof t.rating === 'number' && t.rating > 0) info.rating = Math.round(t.rating * 20) / 10;
    if (t.release_date && /^\d{4}$/.test(String(t.release_date))) info.releaseDate = String(t.release_date);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const json = await this._json(`/titles/${encodeURIComponent(mangaId)}/chapters`);
    const rows = (json.data && Array.isArray(json.data.chapters) ? json.data.chapters : []).filter((c) => c && c.id);
    const seen = new Set();
    const chapters = [];
    rows.forEach((c, i) => {
      const id = String(c.id);
      if (seen.has(id)) return;
      seen.add(id);
      const number = typeof c.number === 'number' ? c.number : rows.length - i;
      const chapter = { id, chapterId: id, name: cleanText(c.name) || `Chapter ${number}`, number };
      const time = Date.parse(c.updated_at);
      if (!Number.isNaN(time)) chapter.time = time;
      chapters.push(chapter);
    });
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._json(`/titles/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`);
    const chapter = (json.data && json.data.chapter) || {};
    let pages = (Array.isArray(chapter.images) ? chapter.images : []).filter((u) => typeof u === 'string' && u);
    if (pages.length === 0 && Array.isArray(chapter.pages)) {
      pages = chapter.pages.map((p) => p && p.url).filter((u) => typeof u === 'string' && u);
    }
    if (pages.length === 0) throw new Error('MangaK returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: COVER_REFERER };
  }

  async _title(mangaId) {
    const hit = this._titles.get(mangaId);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this._json(`/titles/${encodeURIComponent(mangaId)}`).then((json) => {
      const t = json.data && json.data.title;
      if (!t || !t.id) throw new Error('MangaK: title not found');
      return t;
    });
    this._titles.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this._titles.delete(mangaId));
    return promise;
  }

  async _json(path) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url: API_BASE + path,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Origin: SITE_BASE, Referer: SITE_BASE + '/' },
    });
    const response = await manager.schedule(request);
    let json = null;
    try {
      json = JSON.parse(response.data);
    } catch (e) {
      json = null;
    }
    if (response.status < 200 || response.status >= 300 || !json || json.success === false) {
      const why = json && json.message ? json.message : `HTTP ${response.status}`;
      throw new Error(`MangaK ${why} (${path.split('?')[0]})`);
    }
    return json;
  }
}

module.exports = { Source };
