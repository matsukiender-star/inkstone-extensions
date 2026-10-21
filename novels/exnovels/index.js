const CONFIG = {
  "name": "Exnovels",
  "siteBase": "https://exnovels.com",
  "apiBase": "https://api.exnovels.com/api",
  "hostRewrites": {},
  "suggestiveSlugs": []
};

const SITE_BASE = CONFIG.siteBase;
const API_V1 = `${CONFIG.apiBase}/v1`;
const API_V2 = `${CONFIG.apiBase}/v2`;
const NAME = CONFIG.name;
const PAGE_SIZE = 30;
const CHAPTER_PAGE = 100;
const MAX_CHAPTER_REQUESTS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOGIN_RETRY_MS = 60 * 1000;

const BLOCKED_GENRES = ['loli', 'lolicon', 'shota', 'shotacon'];

const SUGGESTIVE_SLUGS = CONFIG.suggestiveSlugs || [];

const HOST_REWRITES = CONFIG.hostRewrites || {};

const FEEDS = [
  { id: 'latest', name: 'Latest Updated' },
  { id: 'newest', name: 'Newest' },
  { id: 'popular', name: 'Popular' },
  { id: 'alphabetical', name: 'A-Z' },
];

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

function absUrl(url) {
  if (!url) return undefined;
  const s = String(url);
  if (!/^https?:\/\//i.test(s)) return `${SITE_BASE}${s.charAt(0) === '/' ? '' : '/'}${s}`;
  let out = s;
  Object.keys(HOST_REWRITES).forEach((from) => {
    out = out.split('//' + from + '/').join('//' + HOST_REWRITES[from] + '/');
  });
  return out;
}

function mapStatus(text) {
  const s = String(text || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  if (s === 'DROPPED' || s === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

function mediumOf(series) {
  return String((series && series.type) || '').toUpperCase() === 'NOVEL' ? 'novel' : 'comics';
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol', 'li', 'pre', 'figure',
  'figcaption', 'table', 'tr', 'hr', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

function htmlLines(html) {
  const $ = cheerio.load(String(html || ''));
  const lines = [];
  let line = '';
  const flush = () => {
    const text = cleanText(String(line).replace(/�+/g, ' '));
    if (text) lines.push(text);
    line = '';
  };
  const walk = (nodes) => {
    nodes.each((_, node) => {
      if (node.type === 'text') {
        line += node.data;
        return;
      }
      if (node.type !== 'tag') return;
      const tag = String(node.name || '').toLowerCase();
      const block = BLOCK_TAGS.has(tag);
      if (block) flush();
      walk($(node).contents());
      if (block) flush();
    });
  };
  walk($.root().contents());
  flush();
  return lines;
}

function hasBlockedGenre(series) {
  return (Array.isArray(series && series.genres) ? series.genres : []).some((g) => {
    const slug = String((g && g.slug) || '').toLowerCase();
    const name = String((g && g.name) || '').toLowerCase().trim();
    return BLOCKED_GENRES.indexOf(slug) !== -1 || BLOCKED_GENRES.indexOf(name) !== -1;
  });
}

function ageRatingOfGenres(series) {
  const genres = Array.isArray(series && series.genres) ? series.genres : [];
  return genres.some((g) => SUGGESTIVE_SLUGS.indexOf(String((g && g.slug) || '').toLowerCase()) !== -1) ? 16 : 0;
}

function genreLabel(name) {
  const t = cleanText(name);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function coinsLabel(chapter) {
  const discounted = Number(chapter && chapter.discountedPrice);
  const price = Number(chapter && chapter.price);
  const cost = discounted > 0 && discounted < price ? discounted : price;
  return cost > 0 ? `${cost} coins` : 'coins';
}

function parseSetCookie(header) {
  if (!header) return [];
  const text = Array.isArray(header) ? header.join(', ') : String(header);
  return text
    .split(/,\s*(?=[A-Za-z0-9!#$%&'*+.^_`|~-]+=)/)
    .map((cookie) => {
      const parts = cookie.split(';');
      const eq = parts[0].indexOf('=');
      if (eq <= 0) return null;
      const attributes = parts.slice(1).join(';').toLowerCase();
      const gone = /max-age=0\b/.test(attributes) || /max-age=-/.test(attributes);
      return { name: parts[0].slice(0, eq).trim(), value: parts[0].slice(eq + 1).trim(), gone };
    })
    .filter(Boolean);
}

function mergeCookies(jar, header) {
  let changed = false;
  parseSetCookie(header).forEach((c) => {
    if (c.gone || c.value === '') {
      if (c.name in jar) {
        delete jar[c.name];
        changed = true;
      }
    } else if (jar[c.name] !== c.value) {
      jar[c.name] = c.value;
      changed = true;
    }
  });
  return changed;
}

function cookieHeaderOf(jar) {
  return Object.keys(jar)
    .map((name) => `${name}=${jar[name]}`)
    .join('; ');
}

function headerOf(response, name) {
  const headers = (response && response.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

class Source {
  constructor() {
    this._genres = null;
    this._rated = null;
    this._session = null;
    this._signInProblem = null;
    this._loginFailedAt = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      if (!this._genres) {
        const json = await this._get(`${API_V1}/series/genres`);
        const seen = new Set();
        this._genres = (Array.isArray(json) ? json : [])
          .filter((g) => g && typeof g.slug === 'string' && g.slug && cleanText(g.name))
          .filter((g) => BLOCKED_GENRES.indexOf(g.slug.toLowerCase()) === -1)
          .filter((g) => (seen.has(g.slug) ? false : seen.add(g.slug)))
          .map((g) => ({ id: g.slug, label: genreLabel(g.name) }));
      }
      return this._genres;
    } catch (e) {
      console.error(`${NAME} getSearchTags failed: ` + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const query = cleanText(request && request.title);
    const wantedMedium = request && request.medium ? String(request.medium) : '';
    const tagIds = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];

    let path;
    if (query) {
      if (query.length < 2) return { results: [], metadata: undefined };
      path = `${API_V1}/series/search?q=${encodeURIComponent(query)}&page=${page}&perPage=${PAGE_SIZE}`;
    } else {
      const params = [`page=${page}`, `perPage=${PAGE_SIZE}`, `sort=${feed.id}`];
      if (tagIds.length) params.push(`genre=${encodeURIComponent(tagIds[0])}`);
      if (wantedMedium === 'novel') params.push('type=NOVEL');
      path = `${API_V1}/series?${params.join('&')}`;
    }

    const [json, rated] = await Promise.all([this._get(path), this._ratedSlugs()]);
    const list = Array.isArray(json && json.data) ? json.data : [];
    const results = list
      .filter((s) => s && s.slug && !s.redirectUrl)
      .filter((s) => !wantedMedium || mediumOf(s) === wantedMedium)
      .map((s) => this._toPartial(s, rated));
    const next = json && json.next;
    return { results, metadata: next ? { page: Number(next) || page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const series = await this._get(`${API_V1}/series/${encodeURIComponent(mangaId)}`);
    this._assertReadable(series);
    const genres = Array.isArray(series.genres) ? series.genres : [];
    const people = [];
    [series.author, series.artist].forEach((field) => {
      String(field || '')
        .split(',')
        .map((p) => cleanText(p))
        .filter(Boolean)
        .forEach((p) => {
          if (people.indexOf(p) === -1) people.push(p);
        });
    });
    const status = mapStatus(series.status);
    const stats = series.stats || {};
    const info = {
      title: cleanText(series.title) || String(mangaId),
      image: absUrl(series.cover),
      desc: htmlLines(series.description).join('\n\n') || undefined,
      status,
      completed: status === 'COMPLETED',
      ageRating: ageRatingOfGenres(series),
      tags: genres.map((g) => genreLabel(g && g.name)).filter(Boolean),
      webURL: `${SITE_BASE}/series/${series.slug || mangaId}`,
      medium: mediumOf(series),
    };
    if (people.length) info.author = people.join(', ');
    const rating = Number(stats.averageRating || series.avgRating);
    if (rating > 0) info.rating = rating;
    if (Number(stats.chapterCount) > 0) info.chapters = Number(stats.chapterCount);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const slug = encodeURIComponent(mangaId);
    const rows = [];
    let cursor = '';
    let more = true;
    for (let request = 0; more && request < MAX_CHAPTER_REQUESTS; request += 1) {
      const json = await this._get(
        `${API_V2}/series/${slug}/chapters?limit=${CHAPTER_PAGE}&sort=asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { auth: true }
      );
      (Array.isArray(json && json.data) ? json.data : []).forEach((c) => rows.push(c));
      cursor = (json && json.nextCursor) || '';
      more = !!(json && json.hasMore) && !!cursor;
    }
    if (more) {
      console.warn(`${NAME}: ${mangaId} has more than ${MAX_CHAPTER_REQUESTS * CHAPTER_PAGE} chapters, the newest are not listed`);
    }

    const seen = new Set();
    const chapters = [];
    rows.forEach((c) => {
      if (!c || !c.slug || seen.has(c.slug)) return;
      seen.add(c.slug);
      const number = Number(c.number);
      const title = cleanText(c.title);
      const base = title ? (/^chapter\b/i.test(title) ? title : `Chapter ${c.number}: ${title}`) : `Chapter ${c.number}`;
      const chapter = {
        id: String(c.slug),
        chapterId: String(c.slug),
        name: c.requiresPurchase ? `${base} (Locked, ${coinsLabel(c)})` : base,
        number: Number.isFinite(number) ? number : 0,
      };
      const time = Date.parse(c.createdAt);
      if (Number.isFinite(time)) chapter.time = time;
      chapters.push(chapter);
    });
    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._get(
      `${API_V1}/series/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`,
      { auth: true }
    );
    const images = (Array.isArray(json && json.images) ? json.images : [])
      .filter((im) => im && im.url)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((im) => absUrl(im.url));
    const lines = typeof (json && json.content) === 'string' ? htmlLines(json.content) : [];

    if (images.length > 0) return { id: chapterId, mangaId, pages: images };
    if (lines.length > 0) return { id: chapterId, mangaId, pages: [], text: lines.join('\n\n') };

    if (json && json.requiresPurchase) {
      const message = this._lockedMessage(json);
      if (json.series && String(json.series.type).toUpperCase() === 'NOVEL') {
        return { id: chapterId, mangaId, pages: [], text: message };
      }
      throw new Error(message);
    }
    throw new Error(`${NAME} returned no pages for this chapter`);
  }

  _toPartial(series, rated) {
    const manga = {
      mangaId: String(series.slug),
      title: cleanText(series.title) || String(series.slug),
      image: absUrl(series.cover),
      status: mapStatus(series.status),
      completed: String(series.status).toUpperCase() === 'COMPLETED',
      ageRating: rated && rated.has(String(series.slug)) ? 16 : 0,
      webURL: `${SITE_BASE}/series/${series.slug}`,
      medium: mediumOf(series),
    };
    const rating = Number(series.avgRating);
    if (rating > 0) manga.rating = rating;
    return manga;
  }

  _assertReadable(series) {
    if (!series || !series.slug) throw new Error(`${NAME}: no such series`);
    if (hasBlockedGenre(series)) throw new Error('This title is not available in this source.');
  }

  _lockedMessage(chapter) {
    const head = `This chapter is paid on ${NAME} (${coinsLabel(chapter)}).`;
    if (!this._credentials()) {
      return `${head} Chapters you have unlocked open here after you enter your ${NAME} email and password in this source's settings. Otherwise it opens on ${SITE_BASE} once it is bought, and the site makes it free later.`;
    }
    if (!this._session && this._signInProblem) {
      return `${head} Signing in failed (${this._signInProblem}). Check the email and password in this source's settings.`;
    }
    return `${head} The account signed in here has not unlocked it. Unlock it on ${SITE_BASE} and it will open here, or wait for the site to make it free.`;
  }

  async _ratedSlugs() {
    if (SUGGESTIVE_SLUGS.length === 0) return new Set();
    if (this._rated && Date.now() - this._rated.at < DAY_MS) return this._rated.slugs;
    const state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
    if (state) {
      try {
        const saved = await state.retrieve('rated');
        if (saved && Array.isArray(saved.slugs) && Date.now() - Number(saved.at) < DAY_MS) {
          this._rated = { at: Number(saved.at), slugs: new Set(saved.slugs) };
          return this._rated.slugs;
        }
      } catch (e) {
      }
    }
    try {
      const slugs = new Set();
      for (let i = 0; i < SUGGESTIVE_SLUGS.length; i += 1) {
        let page = 1;
        for (let guard = 0; page && guard < 5; guard += 1) {
          const json = await this._get(`${API_V1}/series?genre=${SUGGESTIVE_SLUGS[i]}&perPage=100&page=${page}`);
          (Array.isArray(json && json.data) ? json.data : []).forEach((s) => s && s.slug && slugs.add(String(s.slug)));
          page = json && json.next ? Number(json.next) : 0;
        }
      }
      this._rated = { at: Date.now(), slugs };
      if (state) {
        try {
          await state.store('rated', { at: this._rated.at, slugs: Array.from(slugs) });
        } catch (e) {
        }
      }
      return slugs;
    } catch (e) {
      console.warn(`${NAME}: could not read the rated titles, ratings are missing for now: ` + (e && e.message));
      return new Set();
    }
  }

  _credentials() {
    const email = cleanText(App.getSourceSetting('email'));
    const password = String(App.getSourceSetting('password') || '');
    return email && password ? { email, password } : null;
  }

  _state() {
    return typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
  }

  async _saveSession() {
    const state = this._state();
    if (!state || !this._session) return;
    try {
      await state.store('session', { email: this._session.email, jar: this._session.jar });
    } catch (e) {
    }
  }

  async _sessionCookie(force) {
    const account = this._credentials();
    if (!account) {
      this._session = null;
      return null;
    }
    if (!force) {
      if (this._session && this._session.email === account.email) return cookieHeaderOf(this._session.jar) || null;
      const state = this._state();
      if (state) {
        try {
          const saved = await state.retrieve('session');
          if (saved && saved.email === account.email && saved.jar && Object.keys(saved.jar).length > 0) {
            this._session = { email: saved.email, jar: saved.jar };
            return cookieHeaderOf(this._session.jar);
          }
        } catch (e) {
        }
      }
    }
    if (this._loginFailedAt && Date.now() - this._loginFailedAt < LOGIN_RETRY_MS) return null;
    return this._login(account);
  }

  async _login(account) {
    this._session = null;
    let response;
    try {
      response = await App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } }).schedule(
        App.createRequest({
          url: `${API_V1}/auth/login`,
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Origin: SITE_BASE,
            Referer: `${SITE_BASE}/`,
          },
          body: JSON.stringify({ email: account.email, password: account.password }),
        })
      );
    } catch (e) {
      this._fail(`could not reach the site: ${e && e.message}`);
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      this._fail(this._reasonOf(response, response.status === 401 || response.status === 400 ? 'the email or password was refused' : `HTTP ${response.status}`));
      return null;
    }
    const jar = {};
    mergeCookies(jar, headerOf(response, 'set-cookie'));
    if (Object.keys(jar).length === 0) {
      this._fail('the site answered but sent no session');
      return null;
    }
    this._session = { email: account.email, jar };
    this._signInProblem = null;
    this._loginFailedAt = 0;
    await this._saveSession();
    return cookieHeaderOf(jar);
  }

  _fail(problem) {
    this._signInProblem = problem;
    this._loginFailedAt = Date.now();
    console.warn(`${NAME}: sign in failed: ${problem}`);
  }

  _reasonOf(response, fallback) {
    try {
      const body = parseJsonBody(response.data);
      const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      if (message) return cleanText(message);
    } catch (e) {
    }
    return fallback;
  }

  async _refreshSession() {
    if (!this._session) return null;
    try {
      const response = await App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } }).schedule(
        App.createRequest({
          url: `${API_V1}/auth/refresh`,
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Origin: SITE_BASE,
            Referer: `${SITE_BASE}/`,
            Cookie: cookieHeaderOf(this._session.jar),
          },
          body: '{}',
        })
      );
      if (response.status < 200 || response.status >= 300) return null;
      mergeCookies(this._session.jar, headerOf(response, 'set-cookie'));
      await this._saveSession();
      return cookieHeaderOf(this._session.jar);
    } catch (e) {
      return null;
    }
  }

  async _send(url, cookie) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    return manager.schedule(App.createRequest({ url, method: 'GET', headers }));
  }

  async _get(url, options) {
    let cookie = options && options.auth ? await this._sessionCookie(false) : null;
    let response = await this._send(url, cookie);
    if (cookie && (response.status === 401 || response.status === 403)) {
      cookie = (await this._refreshSession()) || (await this._sessionCookie(true));
      response = await this._send(url, cookie);
    }
    if (cookie && this._session && mergeCookies(this._session.jar, headerOf(response, 'set-cookie'))) {
      await this._saveSession();
    }
    if (response.status < 200 || response.status >= 300) {
      let reason = '';
      try {
        const body = parseJsonBody(response.data);
        const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        if (message) reason = ` (${message})`;
      } catch (e) {
        reason = '';
      }
      throw new Error(`${NAME} HTTP ${response.status}${reason}`);
    }
    return parseJsonBody(response.data);
  }
}

module.exports = { Source };
