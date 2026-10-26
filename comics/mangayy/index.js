const SITE_BASE = 'https://mgread.io';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const REFERER = SITE_BASE + '/';
const CHAPTERS_PER_PAGE = 50;
const SEARCH_PAGE_SIZE = 10;
const PAGE_CACHE_MS = 5 * 60 * 1000;
const AGE_CACHE_MS = 30 * 60 * 1000;
const MAX_EMPTY_PAGES = 3;
const SITE_UTC_OFFSET_HOURS = 7;

const FEEDS = [
  { id: 'latest', name: 'Latest', sort: 'updated' },
  { id: 'new', name: 'New', sort: 'new' },
  { id: 'popular', name: 'Most Viewed', sort: 'views' },
  { id: 'weekly', name: 'Weekly Views', sort: 'views_week' },
  { id: 'monthly', name: 'Monthly Views', sort: 'views_month' },
  { id: 'rating', name: 'Top Rated', sort: 'rating' },
  { id: 'followers', name: 'Most Followed', sort: 'follow' },
];

function cleanText(text) {
  return String(text == null ? '' : text)
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function plain(text) {
  return cleanText(text).toLowerCase();
}

function slugOf(href) {
  const m = /\/manga\/([^/?#]+)/.exec(String(href || ''));
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function isAnimeEntry(slug, title, genres) {
  if (/^anime-/i.test(slug)) return true;
  if (/^anime\s*[-\u2013\u2014]/i.test(cleanText(title))) return true;
  return (genres || []).some((g) => plain(g) === 'anime');
}

function ageFromBadge(text) {
  const m = /(\d+)\s*\+/.exec(String(text || ''));
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (n >= 18) return 18;
  if (n >= 16) return 16;
  return 0;
}

function ageFromGenres(genres) {
  const names = (genres || []).map(plain);
  if (names.indexOf('smut') >= 0 || names.indexOf('adult') >= 0) return 18;
  if (names.indexOf('mature') >= 0 || names.indexOf('ecchi') >= 0) return 16;
  return 0;
}

function mapStatus(text) {
  const s = plain(text);
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'season end' || s === 'source hiatus' || s === 'caught up') return 'HIATUS';
  if (s === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u || /^data:/i.test(u)) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function parseCreated(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || ''));
  if (!m) return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - SITE_UTC_OFFSET_HOURS, +m[5], +m[6]);
  return Number.isFinite(t) ? t : undefined;
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function toPartial(card) {
  return {
    mangaId: card.slug,
    title: card.title,
    image: card.image || undefined,
    referer: REFERER,
    ageRating: card.age,
    medium: 'comics',
    webURL: `${SITE_BASE}/manga/${encodeURIComponent(card.slug)}/`,
  };
}

class Source {
  constructor() {
    this._pages = new Map();
    this._tags = null;
    this._ages = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      if (this._tags && Date.now() - this._tags.at < AGE_CACHE_MS) return this._tags.items;
      const $ = cheerio.load(await this._get(`${SITE_BASE}/advanced-filter/`));
      const items = [];
      $('input[name="genre[]"][data-genre-name][value]').each((_, el) => {
        const label = cleanText($(el).attr('data-genre-name'));
        const id = cleanText($(el).attr('value'));
        if (!label || !id || plain(label) === 'anime') return;
        items.push({ id, label });
      });
      if (items.length > 0) this._tags = { at: Date.now(), items };
      return items;
    } catch (e) {
      console.error('Mgread getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = cleanText((request && request.title) || '');
    const tagIds = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean).map(String);
    const page = (metadata && metadata.page) || 1;
    if (title) return this._search(title, page);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    return this._list(feed.sort, tagIds, page);
  }

  async _list(sort, tagIds, page) {
    let at = page;
    for (let tries = 0; tries <= MAX_EMPTY_PAGES; tries += 1, at += 1) {
      const path = at > 1 ? `/advanced-filter/page/${at}/` : '/advanced-filter/';
      const query = [qs({ sort })].concat(tagIds.map((id) => `genre[]=${encodeURIComponent(id)}`)).filter(Boolean).join('&');
      const html = await this._get(`${SITE_BASE}${path}?${query}`);
      const parsed = this._parseList(html);
      if (parsed.cards.length > 0 || !parsed.hasNext) {
        return { results: parsed.cards.map(toPartial), metadata: parsed.hasNext ? { page: at + 1 } : undefined };
      }
    }
    return { results: [], metadata: { page: at } };
  }

  async _search(term, page) {
    const json = await this._json(`${SITE_BASE}/wp-json/initlise/v1/search?${qs({ term, page })}`);
    const rows = Array.isArray(json) ? json : [];
    const ages = rows.length > 0 ? await this._ageIndex() : new Map();
    const cards = [];
    rows.forEach((row) => {
      if (!row || row.post_type !== 'manga') return;
      const slug = slugOf(row.url);
      const title = cleanText(String(row.title || '').replace(/<[^>]+>/g, ' '));
      if (!slug || !title || isAnimeEntry(slug, title, [row.category])) return;
      const thumb = absolute(row.thumb).replace(/-150x150(\.\w+)$/, '-300x400$1');
      cards.push({ slug, title, image: thumb, age: ages.has(slug) ? ages.get(slug) : undefined });
    });
    return { results: cards.map(toPartial), metadata: rows.length >= SEARCH_PAGE_SIZE ? { page: page + 1 } : undefined };
  }

  _parseList(html) {
    const $ = cheerio.load(html);
    const seen = new Set();
    const cards = [];
    $('.manga-item-details, .manga-item-grid').each((_, el) => {
      const item = $(el);
      const link = item.find('h2 a[href*="/manga/"]').first();
      const anchor = link.length ? link : item.find('a[href*="/manga/"]:not([href*="/chapter-"])').first();
      const slug = slugOf(anchor.attr('href'));
      const title = cleanText(anchor.text());
      if (!slug || !title || seen.has(slug)) return;
      const genres = item
        .find('a[href*="/genre/"]')
        .map((__, g) => cleanText($(g).text()))
        .get()
        .filter(Boolean);
      if (isAnimeEntry(slug, title, genres)) return;
      seen.add(slug);
      const img = item.find('img').first();
      const image = absolute(img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'));
      const badge = ageFromBadge(item.find('.badge-age').first().text());
      cards.push({ slug, title, image, age: badge !== undefined ? badge : ageFromGenres(genres) });
    });
    const hasNext = $('li:not(.uk-disabled) > a[aria-label="Next page"]').length > 0;
    return { cards, hasNext };
  }

  async _ageIndex() {
    if (this._ages && Date.now() - this._ages.at < AGE_CACHE_MS) return this._ages.map;
    const map = new Map();
    try {
      for (const [badge, age] of [['18+', 18], ['16+', 16]]) {
        const first = await this._get(`${SITE_BASE}/advanced-filter/?${qs({ age_rating: badge })}`);
        const $ = cheerio.load(first);
        let last = 1;
        $('.uk-pagination a').each((_, a) => {
          const m = /\/page\/(\d+)/.exec($(a).attr('href') || '');
          if (m) last = Math.max(last, parseInt(m[1], 10));
        });
        const htmls = [first];
        const rest = [];
        for (let p = 2; p <= Math.min(last, 60); p += 1) {
          rest.push(this._get(`${SITE_BASE}/advanced-filter/page/${p}/?${qs({ age_rating: badge })}`));
        }
        (await Promise.all(rest)).forEach((h) => htmls.push(h));
        htmls.forEach((h) => this._parseList(h).cards.forEach((c) => map.set(c.slug, age)));
      }
      this._ages = { at: Date.now(), map };
    } catch (e) {
      console.error('Mgread age index failed, search results stay unrated: ' + (e && e.message));
    }
    return map;
  }

  _titlePage(slug) {
    const cached = this._pages.get(slug);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.promise;
    const promise = this._get(`${SITE_BASE}/manga/${encodeURIComponent(slug)}/`).then((html) => {
      const $ = cheerio.load(html);
      const title = cleanText($('#manga-title').contents().filter((_, n) => n.type === 'text').first().text()) || cleanText($('#manga-title').text());
      const id = $('#manga-title').attr('data-id') || $('#chapter-search-input').attr('data-manga-id') || '';
      if (!title || !id) throw new Error(`Mgread: title page of "${slug}" has no title or id`);
      return html;
    });
    this._pages.set(slug, { at: Date.now(), promise });
    promise.catch(() => this._pages.delete(slug));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const html = await this._titlePage(mangaId);
    const $ = cheerio.load(html);
    const title = cleanText($('#manga-title').contents().filter((_, n) => n.type === 'text').first().text()) || cleanText($('#manga-title').text());
    const genres = $('#genre-tags a[href*="/genre/"]')
      .map((_, g) => cleanText($(g).text()))
      .get()
      .filter(Boolean);
    if (isAnimeEntry(mangaId, title, genres)) throw new Error('Mgread: this is an anime entry, which has video and no pages to read');
    let rating;
    $('script[type="application/ld+json"]').each((_, s) => {
      try {
        const json = JSON.parse($(s).html());
        const nodes = Array.isArray(json['@graph']) ? json['@graph'] : [json];
        nodes.forEach((n) => {
          if (n && typeof n.contentRating === 'string' && rating === undefined) rating = ageFromBadge(n.contentRating);
        });
      } catch (e) {
      }
    });
    const status = mapStatus($('#manga-status').text());
    const cover = absolute($('.story-cover img').first().attr('src') || $('meta[property="og:image"]').attr('content'));
    return {
      mangaInfo: {
        mangaId,
        title,
        image: cover || undefined,
        referer: REFERER,
        desc: cleanText($('#manga-description').text()) || undefined,
        status,
        completed: status === 'COMPLETED',
        tags: genres,
        ageRating: rating !== undefined ? rating : ageFromGenres(genres),
        medium: 'comics',
        webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`,
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this._titlePage(mangaId);
    const $ = cheerio.load(html);
    const genres = $('#genre-tags a[href*="/genre/"]')
      .map((_, g) => cleanText($(g).text()))
      .get();
    if (isAnimeEntry(mangaId, $('#manga-title').text(), genres)) throw new Error('Mgread: this is an anime entry, which has video and no pages to read');
    const id = $('#manga-title').attr('data-id') || $('#chapter-search-input').attr('data-manga-id');
    const fetchPage = async (n) => {
      const json = await this._json(`${SITE_BASE}/wp-json/initmanga/v1/chapters?${qs({ manga_id: id, paged: n, per_page: CHAPTERS_PER_PAGE })}`);
      if (!json || !Array.isArray(json.items)) throw new Error(`Mgread: the chapter list of "${mangaId}" page ${n} is not a list`);
      return json;
    };
    const first = await fetchPage(1);
    const total = Math.max(1, parseInt(first.total_pages, 10) || 1);
    const pages = [first];
    if (total > 1) {
      const rest = [];
      for (let n = 2; n <= total; n += 1) rest.push(fetchPage(n));
      (await Promise.all(rest)).forEach((p) => pages.push(p));
    }
    const seen = new Set();
    const chapters = [];
    pages.forEach((p) =>
      p.items.forEach((c) => {
        const slug = cleanText(c && c.slug);
        if (!slug || seen.has(slug)) return;
        seen.add(slug);
        const number = Number(c.number);
        const label = Number.isFinite(number) ? String(number) : slug;
        const heading = cleanText(c.title);
        const locked = c.lock_type && c.lock_type !== 'none' && !c.is_purchased;
        const row = {
          id: slug,
          chapterId: slug,
          name: (heading ? `Chapter ${label} - ${heading}` : `Chapter ${label}`) + (locked ? ' (Locked)' : ''),
          number: Number.isFinite(number) && number >= 0 ? number : 0,
        };
        const time = parseCreated(c.created_at);
        if (time !== undefined) row.time = time;
        chapters.push(row);
      }),
    );
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this._get(`${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`);
    const $ = cheerio.load(html);
    const pages = [];
    $('#chapter-content img').each((_, el) => {
      const url = absolute($(el).attr('data-original-src')) || absolute($(el).attr('src'));
      if (url && pages.indexOf(url) < 0) pages.push(url);
    });
    if (pages.length === 0) {
      throw new Error('Mgread returned no pages for this chapter (it may be locked on the site)');
    }
    return { id: chapterId, mangaId, pages, referer: REFERER };
  }

  async _get(url) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', 'Accept-Language': 'en-US,en;q=0.9' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Mgread HTTP ${response.status} for ${url.replace(SITE_BASE, '').split('?')[0]}`);
    return response.data;
  }

  async _json(url) {
    const text = await this._get(url);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Mgread answered something that is not JSON for ${url.replace(SITE_BASE, '').split('?')[0]}`);
    }
  }
}

module.exports = { Source };
