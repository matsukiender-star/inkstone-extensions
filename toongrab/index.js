const SITE_BASE = 'https://toongrab.com';
const API_BASE = `${SITE_BASE}/api/manga`;
const PAGE_SIZE = 30;
const CHAPTER_PAGE_SIZE = 100;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';

const SORTS = {
  latest: { sort: 'Latest Updates' },
  trending: { sort: 'trending', period: 'day' },
  trendingWeek: { sort: 'trending', period: 'week' },
  popular: { sort: 'Most Popular' },
  rating: { sort: 'Highest Rating' },
  new: { sort: 'Newest Added' },
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function coverUrl(url, width) {
  if (!url) return undefined;
  return `${SITE_BASE}/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

function mapStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'ongoing':
      return 'ONGOING';
    case 'completed':
      return 'COMPLETED';
    case 'hiatus':
      return 'HIATUS';
    default:
      return 'UNKNOWN';
  }
}

function rating10(value) {
  return typeof value === 'number' && value > 0 ? Math.round(value * 20) / 10 : undefined;
}

function numberText(n) {
  return String(n);
}

function toPartialManga(item) {
  return {
    mangaId: item.slug,
    title: item.title,
    image: coverUrl(item.coverUrl, 384),
    status: mapStatus(item.status),
    completed: String(item.status || '').toLowerCase() === 'completed',
    rating: rating10(item.rating),
    chapters: item._count && typeof item._count.chapters === 'number' ? item._count.chapters : undefined,
    medium: 'comics',
    webURL: `${SITE_BASE}/manga/${item.slug}`,
  };
}

class Source {
  constructor() {
    this._genres = null;
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'trending', name: 'Trending' },
      { id: 'popular', name: 'Most Popular' },
      { id: 'rating', name: 'Highest Rated' },
      { id: 'new', name: 'Newly Added' },
    ];
  }

  async getSortOptions() {
    return [
      { id: 'latest', label: 'Latest Updates' },
      { id: 'trendingWeek', label: 'Trending This Week' },
      { id: 'popular', label: 'Most Popular' },
      { id: 'rating', label: 'Highest Rated' },
      { id: 'new', label: 'Newly Added' },
    ];
  }

  async getSearchTags() {
    try {
      if (!this._genres) {
        const json = await this._json(`${API_BASE}/genres`);
        const groups = new Map();
        (Array.isArray(json) ? json : []).forEach((g) => {
          if (!g || typeof g.name !== 'string' || !g.name) return;
          const key = g.name.toLowerCase();
          const group = groups.get(key) || { names: [], best: g };
          group.names.push(g.name);
          if ((g.count || 0) > (group.best.count || 0)) group.best = g;
          groups.set(key, group);
        });
        this._genres = [...groups.values()]
          .map((group) => ({ id: group.names.join(','), label: group.best.name }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }
      return this._genres;
    } catch (e) {
      console.error('ToonGrab getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const title = ((request && request.title) || '').trim();
    const feed = (request && request.feed) || 'latest';
    const sortId = (request && request.sortId) || null;
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const how = SORTS[sortId] || SORTS[feed] || SORTS.latest;
    const genres = ((request && request.includedTags) || [])
      .map((t) => t && t.id)
      .filter(Boolean)
      .join(',');
    const json = await this._json(
      `${API_BASE}/browse?${qs({
        search: title || undefined,
        sort: how.sort,
        period: how.period,
        genres: genres || undefined,
        page,
        limit: PAGE_SIZE,
      })}`,
    );
    const data = Array.isArray(json.data) ? json.data : [];
    const totalPages = typeof json.totalPages === 'number' ? json.totalPages : page;
    return {
      results: data.filter((item) => item && item.slug).map(toPartialManga),
      metadata: data.length > 0 && page < totalPages ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const manga = await this._json(`${API_BASE}/${encodeURIComponent(mangaId)}`);
    if (!manga || !manga.slug) throw new Error('ToonGrab: title not found');
    const genres = Array.isArray(manga.genres) ? manga.genres.filter((g) => typeof g === 'string') : [];
    const people = [manga.author, manga.artist].filter((n) => typeof n === 'string' && n.trim());
    const info = {
      ...toPartialManga(manga),
      image: coverUrl(manga.coverUrl, 640),
      desc: (manga.customSynopsis || manga.description || '').trim() || undefined,
      tags: genres,
      author: [...new Set(people.map((n) => n.trim()))].join(' / ') || undefined,
      releaseDate: manga.releaseYear ? String(manga.releaseYear) : undefined,
      chapters: manga._count && typeof manga._count.chapters === 'number' ? manga._count.chapters : undefined,
    };
    if (genres.some((g) => g.toLowerCase() === 'ecchi')) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const base = `${API_BASE}/${encodeURIComponent(mangaId)}/chapters?limit=${CHAPTER_PAGE_SIZE}`;
    const first = await this._json(`${base}&page=1`);
    const pages = [first];
    const totalPages = typeof first.totalPages === 'number' ? first.totalPages : 1;
    if (totalPages > 1) {
      const rest = [];
      for (let p = 2; p <= totalPages; p++) rest.push(this._json(`${base}&page=${p}`));
      (await Promise.all(rest)).forEach((r) => pages.push(r));
    }
    const rows = [];
    pages.forEach((r) => (Array.isArray(r.chapters) ? r.chapters : []).forEach((c) => rows.push(c)));
    const expected = typeof first.totalCount === 'number' ? first.totalCount : rows.length;
    if (rows.length < expected) {
      throw new Error(`ToonGrab: got ${rows.length} of ${expected} chapters`);
    }
    const seen = new Set();
    const chapters = [];
    rows.forEach((c) => {
      if (!c || typeof c.chapterNumber !== 'number') return;
      const id = numberText(c.chapterNumber);
      if (seen.has(id)) return;
      seen.add(id);
      chapters.push({
        id,
        chapterId: id,
        name: c.title ? String(c.title) : `Chapter ${id}`,
        number: c.chapterNumber,
        time: c.createdAt ? Date.parse(c.createdAt) || undefined : undefined,
      });
    });
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._json(`${API_BASE}/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`);
    const pages = (Array.isArray(json.images) ? json.images : []).filter((u) => typeof u === 'string' && u);
    if (pages.length === 0) throw new Error('ToonGrab returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async _json(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ToonGrab HTTP ${response.status} for ${url}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
