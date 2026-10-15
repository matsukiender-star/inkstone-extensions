const API_BASE = 'https://api.asurascans.com/api';
const SITE_BASE = 'https://asurascans.com';
const PAGE_SIZE = 20;

const NOVEL_PREFIX = 'novel:';

const NOVEL_SORTS = {
  trending: undefined,
  latest: undefined,
  popular: 'popular',
  rating: 'rating',
  title: 'title',
};

const SESSION_KEY = 'session';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SIGN_IN_RETRY_MS = 60 * 1000;

const STAFF_ROLES = ['staff', 'moderator', 'uploader', 'admin'];
const PAID_ROLES = ['premium', 'mythic'];

function sessionIsPremium(session) {
  const role = session.role || 'user';
  if (STAFF_ROLES.indexOf(role) !== -1) return true;
  if (PAID_ROLES.indexOf(role) !== -1 && session.premiumUntil) {
    return Date.parse(session.premiumUntil) > Date.now();
  }
  return false;
}

function parseJSONOrNull(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function lockedNovelText(shardCost, account, problem) {
  const price = shardCost > 0 ? ` (${shardCost} shards)` : '';
  const head = `This chapter is premium on Asura Scans${price}.`;
  if (account === 'failed') {
    return `${head} Signing in failed${problem ? ` (${problem})` : ''}. Check the email and password in this source's settings.`;
  }
  if (account === 'signed-in') {
    return `${head} The account signed in here has no access to it yet. Unlock it on asurascans.com, or get a premium plan, and it will open here.`;
  }
  return `${head} To read premium chapters, enter your Asura Scans email and password in this source's settings. Otherwise open it on asurascans.com.`;
}

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'trending', name: 'Trending' },
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'title', name: 'A–Z' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${API_BASE}/genres`);
      return (json.data || [])
        .map((g) => ({ id: g.slug, label: g.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('AsuraScans getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || null;
    const tagIds = ((request && request.includedTags) || [])
      .map((t) => t.id)
      .filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    const offset = (page - 1) * PAGE_SIZE;
    const params = { limit: PAGE_SIZE, offset };
    if (tagIds.length) params.genres = tagIds.join(',');

    if ((request && request.medium) === 'novel') {
      return this.searchNovels(query, feed, params, offset, page);
    }

    let url;
    if (query) {
      params.q = query;
      url = `${API_BASE}/search?${qs(params)}`;
    } else {
      params.sort = feed || 'trending';
      url = `${API_BASE}/series?${qs(params)}`;
    }

    const json = await this.requestJSON(url);
    const data = json.data || [];
    const results = data.map((s) => this.toPartialManga(s));
    const total = json.meta && typeof json.meta.total === 'number' ? json.meta.total : 0;
    const hasMore = data.length > 0 && offset + data.length < total;
    return { results, metadata: hasMore ? { page: page + 1 } : undefined };
  }

  async searchNovels(query, feed, params, offset, page) {
    const sort = Object.prototype.hasOwnProperty.call(NOVEL_SORTS, feed) ? NOVEL_SORTS[feed] : undefined;
    params.sort = sort;
    if (sort === 'title') params.order = 'asc';
    if (query) params.search = query;

    const json = await this.requestJSON(`${API_BASE}/novel-series?${qs(params)}`);
    const data = json.data || [];
    const total = json.meta && typeof json.meta.total === 'number' ? json.meta.total : 0;
    const hasMore = data.length > 0 && offset + data.length < total;
    return {
      results: data.map((s) => this.toPartialNovel(s)),
      metadata: hasMore ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const ref = splitId(mangaId);
    if (ref.medium === 'novel') {
      const json = await this.fetchNovel(ref.slug);
      if (!json.series) throw new Error('novel not found');
      return this.toNovelInfo(json.series);
    }
    const json = await this.requestJSON(`${API_BASE}/series/${encodeURIComponent(mangaId)}`);
    const series = json.series || (json.data && json.data.series);
    if (!series) throw new Error('series not found');
    return this.toMangaInfo(series);
  }

  async getChapters(mangaId) {
    const ref = splitId(mangaId);
    if (ref.medium === 'novel') {
      try {
        const json = await this.fetchNovel(ref.slug);
        const premium = await this.isPremium();
        return (json.chapters || []).map((c) => {
          const number = Number(c.number);
          const title = typeof c.title === 'string' ? c.title.trim() : '';
          const baseName = title ? `Chapter ${number} - ${title}` : `Chapter ${number}`;
          const locked = c.is_locked === true && !premium;
          const cost = Number(c.shard_cost);
          return {
            id: String(number),
            chapterId: String(number),
            name: locked ? `${baseName} (Locked, ${cost > 0 ? `${cost} shards` : 'premium'})` : baseName,
            number,
            time: c.published_at ? Date.parse(c.published_at) : undefined,
          };
        });
      } catch (e) {
        console.error('AsuraScans getChapters (novel) failed:', e);
        throw e;
      }
    }
    try {
      const json = await this.requestJSON(
        `${API_BASE}/series/${encodeURIComponent(mangaId)}/chapters`,
        { auth: true }
      );
      const premium = await this.isPremium();
      return (json.data || []).map((c) => {
        const baseName = c.title || `Chapter ${c.number}`;
        const unlockAt = c.early_access_until ? Date.parse(c.early_access_until) : NaN;
        const locked =
          c.is_premium === true && Number.isFinite(unlockAt) && unlockAt > Date.now() && !premium;
        return {
          id: String(c.number),
          chapterId: String(c.number),
          name: locked ? `${baseName} (Locked, unlocks in ${formatUnlockIn(unlockAt)})` : baseName,
          number: Number(c.number),
          time: c.published_at ? Date.parse(c.published_at) : undefined,
        };
      });
    } catch (e) {
      console.error('AsuraScans getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    const ref = splitId(mangaId);
    if (ref.medium === 'novel') {
      const json = await this.requestJSON(
        `${API_BASE}/novel-series/${encodeURIComponent(ref.slug)}/chapter/${encodeURIComponent(chapterId)}`,
        { auth: true }
      );
      const chapter = json.data && typeof json.data === 'object' ? json.data : json;
      if (chapter.is_locked === true) {
        const session = await this.getSession();
        const account = session ? 'signed-in' : this.signInProblem ? 'failed' : 'none';
        return {
          id: chapterId,
          mangaId,
          pages: [],
          text: lockedNovelText(Number(chapter.shard_cost), account, this.signInProblem),
        };
      }
      const text = novelHtmlToText(chapter.content_html);
      if (!text) throw new Error('AsuraScans: this chapter came back with no text');
      return { id: chapterId, mangaId, pages: [], text };
    }
    const json = await this.requestJSON(
      `${API_BASE}/series/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`,
      { auth: true }
    );
    const chapter = json.data && json.data.chapter;
    const pages = (chapter && chapter.pages) || [];
    return {
      id: chapterId,
      mangaId,
      pages: pages.map((p) => (typeof p === 'string' ? p : p.url)).filter(Boolean),
    };
  }

  async requestJSON(url, options) {
    const session = options && options.auth ? await this.getSession() : null;
    let response = await this.send(url, { token: session && session.accessToken });
    if (session && (response.status === 401 || response.status === 403)) {
      const renewed = await this.renewSession(session);
      response = await this.send(url, { token: renewed && renewed.accessToken });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AsuraScans API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }

  async send(url, opts) {
    const manager = App.createRequestManager({});
    const headers = { 'User-Agent': UA, Accept: 'application/json' };
    if (opts && opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts && opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const request = App.createRequest({
      url,
      method: opts && opts.body !== undefined ? 'POST' : 'GET',
      headers,
      body: opts && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    return manager.schedule(request);
  }

  get state() {
    if (!this.stateManager) this.stateManager = App.createSourceStateManager();
    return this.stateManager;
  }

  async getSession() {
    const now = Date.now();
    if (this.sessionPromise && !(this.sessionFailedAt && now - this.sessionFailedAt > SIGN_IN_RETRY_MS)) {
      return this.sessionPromise;
    }
    this.sessionFailedAt = 0;
    this.sessionPromise = this.loadSession().then(
      (session) => {
        if (!session) this.sessionFailedAt = Date.now();
        return session;
      },
      (e) => {
        this.signInProblem = (e && e.message) || 'sign-in failed';
        this.sessionFailedAt = Date.now();
        console.error('AsuraScans sign-in failed:', this.signInProblem);
        return null;
      }
    );
    return this.sessionPromise;
  }

  async loadSession() {
    const email = String(App.getSourceSetting('email') || '').trim();
    const password = String(App.getSourceSetting('password') || '');
    this.signInProblem = null;
    if (!email || !password) return null;
    const saved = await this.state.retrieve(SESSION_KEY).catch(() => null);
    if (
      saved &&
      saved.email === email &&
      saved.accessToken &&
      Date.now() - (saved.savedAt || 0) < SESSION_MAX_AGE_MS
    ) {
      return saved;
    }
    return this.signIn(email, password);
  }

  async signIn(email, password) {
    const response = await this.send(`${API_BASE}/auth/login`, { body: { email, password } });
    const body = parseJSONOrNull(response.data) || {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(body.error || body.message || `HTTP ${response.status}`);
    }
    const data = body.data || body;
    if (!data.access_token) throw new Error('the site sent no token');
    const user = data.user || {};
    const session = {
      email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      role: user.role || 'user',
      premiumUntil: user.premium_until || null,
      savedAt: Date.now(),
    };
    await this.state.store(SESSION_KEY, session).catch(() => {});
    this.sessionPromise = Promise.resolve(session);
    return session;
  }

  async renewSession(session) {
    try {
      if (session.refreshToken) {
        const response = await this.send(`${API_BASE}/auth/refresh`, {
          body: { refresh_token: session.refreshToken },
        });
        const body = parseJSONOrNull(response.data) || {};
        const data = body.data || body;
        if (response.status >= 200 && response.status < 300 && data.access_token) {
          const renewed = Object.assign({}, session, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || session.refreshToken,
            savedAt: Date.now(),
          });
          await this.state.store(SESSION_KEY, renewed).catch(() => {});
          this.sessionPromise = Promise.resolve(renewed);
          return renewed;
        }
      }
      const email = String(App.getSourceSetting('email') || '').trim();
      const password = String(App.getSourceSetting('password') || '');
      return email && password ? await this.signIn(email, password) : null;
    } catch (e) {
      this.signInProblem = (e && e.message) || 'sign-in failed';
      console.error('AsuraScans token renewal failed:', this.signInProblem);
      return null;
    }
  }

  async isPremium() {
    const session = await this.getSession();
    return !!session && sessionIsPremium(session);
  }

  fetchNovel(slug) {
    const now = Date.now();
    const hit = novelFetches.get(slug);
    if (hit && now - hit.at < NOVEL_SHARE_MS) return hit.promise;
    if (novelFetches.size >= 4) novelFetches.clear();
    const promise = this.requestJSON(`${API_BASE}/novel-series/${encodeURIComponent(slug)}`, {
      auth: true,
    }).catch((e) => {
      novelFetches.delete(slug);
      throw e;
    });
    novelFetches.set(slug, { at: now, promise });
    return promise;
  }

  toPartialNovel(s) {
    return {
      mangaId: NOVEL_PREFIX + s.slug,
      title: s.title,
      image: s.cover_url,
      author: s.author || undefined,
      summary: htmlToText(s.description),
      tags: (s.genres || []).filter((g) => typeof g === 'string'),
      webURL: `${SITE_BASE}/novels/${s.slug}`,
      medium: 'novel',
      rating: typeof s.rating === 'number' ? s.rating : undefined,
      views: typeof s.view_count === 'number' ? s.view_count : undefined,
      chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
      completed: isCompletedStatus(s.status),
    };
  }

  toNovelInfo(s) {
    return {
      mangaInfo: {
        title: s.title,
        image: s.cover_url,
        author: s.author || undefined,
        desc: htmlToText(s.description),
        status: mapStatus(s.status),
        tags: (s.genres || []).filter((g) => typeof g === 'string'),
        webURL: `${SITE_BASE}/novels/${s.slug}`,
        medium: 'novel',
        rating: typeof s.rating === 'number' ? s.rating : undefined,
        views: typeof s.view_count === 'number' ? s.view_count : undefined,
        chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
        completed: isCompletedStatus(s.status),
      },
    };
  }

  toPartialManga(s) {
    return {
      mangaId: s.slug,
      title: s.title,
      image: s.cover,
      author: [s.author, s.artist].filter(Boolean).join(' / ') || undefined,
      summary: htmlToText(s.description),
      tags: (s.genres || []).map((g) => g.name),
      webURL: s.public_url ? `${SITE_BASE}${s.public_url}` : undefined,
      medium: 'comics',
      rating: typeof s.rating === 'number' ? s.rating : undefined,
      chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
      completed: isCompletedStatus(s.status),
      releaseDate: s.release_year ? String(s.release_year) : undefined,
    };
  }

  toMangaInfo(s) {
    return {
      mangaInfo: {
        title: s.title,
        image: s.cover,
        author: [s.author, s.artist].filter(Boolean).join(' / ') || undefined,
        desc: htmlToText(s.description),
        status: mapStatus(s.status),
        tags: (s.genres || []).map((g) => g.name),
        webURL: s.public_url ? `${SITE_BASE}${s.public_url}` : undefined,
        medium: 'comics',
        rating: typeof s.rating === 'number' ? s.rating : undefined,
        chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
        completed: isCompletedStatus(s.status),
        releaseDate: s.release_year ? String(s.release_year) : undefined,
      },
    };
  }
}

const NOVEL_SHARE_MS = 8000;
const novelFetches = new Map();

function splitId(mangaId) {
  const id = String(mangaId);
  return id.startsWith(NOVEL_PREFIX)
    ? { medium: 'novel', slug: id.slice(NOVEL_PREFIX.length) }
    : { medium: 'comics', slug: id };
}

function mapStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'ongoing':
      return 'ONGOING';
    case 'completed':
    case 'complete':
    case 'ended':
      return 'COMPLETED';
    case 'hiatus':
      return 'HIATUS';
    case 'cancelled':
    case 'dropped':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function isCompletedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'ended';
}

function formatUnlockIn(unlockAtMs) {
  const totalMinutes = Math.ceil((unlockAtMs - Date.now()) / 60000);
  if (totalMinutes <= 0) return 'moments';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

const KNOWN_TAG_RE =
  /^<\/?(p|br|strong|em|b|i|u|s|span|div|li|ul|ol|a|h[1-6]|blockquote|sup|sub|hr|img)(?:[\s/>]|$)/i;

function escapeStrayAngleBrackets(html) {
  let out = '';
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<' && !KNOWN_TAG_RE.test(html.slice(i, i + 16))) {
      out += '&lt;';
    } else {
      out += html[i];
    }
  }
  return out;
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(escapeStrayAngleBrackets(String(html)));
  $('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  $('p, div, li').each((_, el) => {
    const isParagraph = el.tagName && el.tagName.toLowerCase() === 'p';
    $(el).append(isParagraph ? '\n\n' : '\n');
  });
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function novelHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  const $ = cheerio.load(escapeStrayAngleBrackets(html));
  $('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  $('p, div, h1, h2, h3, h4, h5, h6, blockquote, li').each((_, el) => {
    $(el).append('\n\n');
  });
  const paragraphs = [];
  for (const block of $.root().text().split(/\n\s*\n+/)) {
    let text = block.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/\s*(?:=\s*){3,}$/, '').trim();
    if (!text) continue;
    if (text.indexOf('*') !== -1 && /^[*\s]+$/.test(text)) {
      paragraphs.push('* * *');
      continue;
    }
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs.join('\n\n');
}

module.exports = { Source };
