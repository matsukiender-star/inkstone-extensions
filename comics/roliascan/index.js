const SITE_BASE = 'https://roliascan.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const PAGE_SIZE = 24;
const SETS_KEY = 'rating-sets-v1';
const SETS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SET_TAGS = { 742: 18, 202: 18, 404: 16 };
const SET_MAX_PAGES = 20;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', sort: 'post_desc' },
  { id: 'popular', name: 'Popular', sort: 'popular_desc' },
  { id: 'release', name: 'Release Date', sort: 'release_desc' },
  { id: 'title', name: 'Title A-Z', sort: 'title_asc' },
];

const TAGS = [
  ['Action', 5],
  ['Adaptation', 49],
  ['Adapted to Manhua', 717],
  ['Adult Cast', 119],
  ['Adventure', 19],
  ['Aliens', 803],
  ['Animals', 240],
  ['Award Winning', 8],
  ['Childcare', 1146],
  ['Combat Sports', 358],
  ['Comedy', 61],
  ['Cooking', 266],
  ['Crime', 248],
  ['Crossdressing', 724],
  ['Delinquents', 228],
  ['Demons', 162],
  ['Detective', 150],
  ['Drama', 26],
  ['Ecchi', 117],
  ['Erotica', 202],
  ['Fantasy', 17],
  ['Full Color', 40],
  ['Gag Humor', 1068],
  ['Game', 1130],
  ['Gender Bender', 1190],
  ['Ghosts', 215],
  ['Gore', 187],
  ['Gourmet', 89],
  ['Harem', 47],
  ['Historical', 66],
  ['Horror', 67],
  ['Isekai', 55],
  ['Josei', 1062],
  ['Light Novel', 98],
  ['Long Strip', 41],
  ['Love Status Quo', 541],
  ['Mafia', 356],
  ['Magic', 45],
  ['Magical Sex Shift', 551],
  ['Manga', 97],
  ['Manhua', 35],
  ['Manhwa', 18],
  ['Martial Arts', 56],
  ['Mature', 404],
  ['Mecha', 396],
  ['Medical', 244],
  ['Military', 131],
  ['Monster Girls', 231],
  ['Monsters', 46],
  ['Music', 694],
  ['Mystery', 34],
  ['Mythology', 110],
  ['Ninja', 163],
  ['Office Workers', 505],
  ['Official Colored', 866],
  ['Organized Crime', 134],
  ['Otaku Culture', 570],
  ['Parody', 605],
  ['Philosophical', 912],
  ['Post-Apocalyptic', 241],
  ['Psychological', 149],
  ['Regression', 1131],
  ['Reincarnation', 29],
  ['Revenge', 964],
  ['Reverse Harem', 1085],
  ['Romance', 2],
  ['Romantic Subtext', 486],
  ['School', 14],
  ['School Life', 27],
  ['Sci-Fi', 33],
  ['Seinen', 105],
  ['Self-Published', 577],
  ['Sexual Violence', 536],
  ['Shoujo', 1071],
  ['Shounen', 11],
  ['Showbiz', 429],
  ['Slice of Life', 93],
  ['Smut', 742],
  ['Space', 206],
  ['Sports', 9],
  ['Streaming', 1132],
  ['Suggestive', 1116],
  ['Super Power', 6],
  ['Superhero', 865],
  ['Supernatural', 65],
  ['Survival', 236],
  ['Suspense', 287],
  ['Team Sports', 10],
  ['Thriller', 184],
  ['Time Travel', 37],
  ['Tragedy', 316],
  ['Transmigiration', 1133],
  ['Urban Fantasy', 120],
  ['Vampire', 209],
  ['Video Game', 277],
  ['Video Games', 616],
  ['Villainess', 355],
  ['Virtual Reality', 617],
  ['Web Comic', 48],
  ['Webtoon', 350],
  ['Workplace', 138],
  ['Wuxia', 68],
  ['Xianxia', 718],
  ['Zombies', 1115]
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
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

function ageRatingOfTags(names) {
  const set = (names || []).map((n) => cleanText(n).toLowerCase());
  if (set.indexOf('smut') >= 0 || set.indexOf('erotica') >= 0) return 18;
  if (['mature', 'ecchi', 'sexual violence', 'suggestive'].some((t) => set.indexOf(t) >= 0)) return 16;
  return 0;
}

const UNIT_MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
function relativeTime(text) {
  const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(String(text || ''));
  if (!m) return undefined;
  return Date.now() - Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
}

function htmlText(html) {
  const $ = cheerio.load('<div>' + String(html || '') + '</div>');
  $('br').replaceWith('\n');
  $('p').each((_, el) => {
    $(el).append('\n\n');
  });
  return $('div').first().text().replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

class Source {
  constructor() {
    this._sets = null;
    this._setsLoading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return TAGS.map(([label, id]) => ({ id: String(id), label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = cleanText((request && request.title) || '');
    const page = Math.max(1, (metadata && metadata.page) || 1);

    if (title) {
      const json = await this._post('/auth/search', { query: title, limit: 25 });
      const list = (json && json.results) || [];
      const rows = list
        .filter((r) => r && r.id && r.type !== 'Novel')
        .map((r) => ({ id: String(r.id), title: cleanText(r.title), cover: r.thumbnail, status: r.status, url: r.permalink || `${SITE_BASE}/manga/${r.slug}` }));
      return { results: await this._rated(rows.map((r) => this._partial(r))), metadata: undefined };
    }

    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const genres = ((request && request.includedTags) || []).map((t) => parseInt(t && t.id, 10)).filter((n) => Number.isFinite(n));
    const data = await this._load({ page, sort: feed.sort, genres, match: 'all' });
    const seen = new Set();
    const rows = [];
    data.forEach((r) => {
      if (!r || !r.id || !r.url || r.type === 'Novel' || seen.has(String(r.id))) return;
      seen.add(String(r.id));
      rows.push({ id: String(r.id), title: cleanText(r.title), cover: r.cover, status: r.status, url: r.url });
    });
    return {
      results: await this._rated(rows.map((r) => this._partial(r))),
      metadata: data.length >= PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  _partial(r) {
    const status = mapStatus(r.status);
    return {
      mangaId: r.id,
      title: r.title || r.id,
      image: r.cover || undefined,
      status,
      completed: status === 'COMPLETED',
      medium: 'comics',
      webURL: r.url,
    };
  }

  async getMangaDetails(mangaId) {
    const data = await this._get(`/wp-json/wp/v2/manga/${encodeURIComponent(mangaId)}?_embed`);
    if (!data || !data.id) throw new Error('Rolia Scan: title not found');
    const terms = (data._embedded && data._embedded['wp:term']) || [];
    const names = (taxonomy) => {
      const group = terms.find((g) => g && g[0] && g[0].taxonomy === taxonomy) || [];
      return group.map((t) => cleanText(t.name)).filter(Boolean);
    };
    const tags = names('post_tag');
    if (tags.some(isBlockedTagName)) throw new Error('Rolia Scan does not serve this title: it carries a Lolicon or Shotacon style tag');
    const title = cleanText(htmlText(data.title && data.title.rendered)) || String(mangaId);
    let status = 'UNKNOWN';
    try {
      const found = await this._post('/auth/search', { query: title, limit: 10 });
      const hit = ((found && found.results) || []).find((r) => String(r.id) === String(mangaId));
      if (hit) status = mapStatus(hit.status);
    } catch (e) {
      status = 'UNKNOWN';
    }
    const media = (data._embedded && data._embedded['wp:featuredmedia']) || [];
    const info = {
      mangaId: String(mangaId),
      title,
      image: (media[0] && media[0].source_url) || undefined,
      author: names('manga_author').join(', ') || undefined,
      desc: htmlText(data.content && data.content.rendered) || undefined,
      status,
      completed: status === 'COMPLETED',
      tags: tags.concat(data.type && tags.indexOf(data.type) < 0 && ['Manga', 'Manhwa', 'Manhua'].indexOf(data.type) < 0 ? [data.type] : []),
      ageRating: ageRatingOfTags(tags),
      medium: 'comics',
      webURL: data.link || `${SITE_BASE}/manga/${data.slug}`,
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const rows = [];
    let offset = 0;
    for (let guard = 0; guard < 40; guard++) {
      const json = await this._chapterPage(mangaId, offset);
      const list = Array.isArray(json.chapters) ? json.chapters : [];
      list.forEach((c) => rows.push(c));
      if (!json.has_more || list.length === 0) break;
      offset += list.length;
    }
    const seen = new Set();
    const chapters = [];
    rows.forEach((c) => {
      if (!c || !c.id || String(c.language || 'en').toLowerCase() !== 'en') return;
      const number = parseFloat(c.chapter);
      const key = Number.isFinite(number) ? 'n' + number : 'i' + c.id;
      if (seen.has(key)) return;
      seen.add(key);
      const extra = c.title && !/^(n\/a|-|\u2014)?$/i.test(String(c.title).trim()) ? ': ' + cleanText(c.title) : '';
      const row = {
        id: String(c.id),
        chapterId: String(c.id),
        name: `Chapter ${c.chapter}${extra}`,
        number: Number.isFinite(number) ? number : chapters.length + 1,
      };
      const time = relativeTime(c.date);
      if (time !== undefined) row.time = time;
      if (c.group_name && c.group_name !== 'N/A') row.group = String(c.group_name);
      chapters.push(row);
    });
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._get(`/auth/chapter-content?chapter_id=${encodeURIComponent(chapterId)}`);
    const pages = (Array.isArray(json.images) ? json.images : []).filter((u) => typeof u === 'string' && u);
    if (pages.length === 0) throw new Error('Rolia Scan returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async _chapterPage(mangaId, offset) {
    const now = Math.floor(Date.now() / 1000);
    const d = new Date(now * 1000);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const hour = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
    const token = CryptoJS.MD5(`${now}mng_ch_${hour}`).toString().substring(0, 16);
    const query = `manga_id=${encodeURIComponent(mangaId)}&offset=${offset}&limit=500&order=DESC&_t=${token}&_ts=${now}`;
    const json = await this._get('/auth/manga-chapters?' + query, true);
    if (json === null) throw new Error('Rolia Scan refused the chapter list (HTTP 403): the device clock is probably more than a minute off');
    return json;
  }

  async _load({ page, sort, genres, match }) {
    const body = {
      page,
      search: '',
      years: '[]',
      genres: JSON.stringify(genres || []),
      types: '[]',
      statuses: '[]',
      sort,
      genreMatchMode: match || 'any',
    };
    const json = await this._post('/wp-json/manga/v1/load', body);
    return Array.isArray(json) ? json : [];
  }

  async _ratingSets() {
    if (this._sets) return this._sets;
    if (!this._setsLoading) {
      this._setsLoading = this._loadSets().then(
        (s) => {
          this._setsLoading = null;
          this._sets = s;
          return s;
        },
        (e) => {
          this._setsLoading = null;
          throw e;
        },
      );
    }
    return this._setsLoading;
  }

  async _loadSets() {
    const state = App.createSourceStateManager();
    let saved = null;
    try {
      saved = await state.retrieve(SETS_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved && typeof saved.at === 'number' && Date.now() - saved.at < SETS_MAX_AGE_MS && saved.ages) return saved.ages;
    const ages = {};
    for (const tag of Object.keys(SET_TAGS)) {
      for (let page = 1; page <= SET_MAX_PAGES; page++) {
        const data = await this._load({ page, sort: 'post_desc', genres: [Number(tag)], match: 'any' });
        data.forEach((r) => {
          if (!r || !r.id) return;
          const id = String(r.id);
          if (!ages[id] || ages[id] < SET_TAGS[tag]) ages[id] = SET_TAGS[tag];
        });
        if (data.length < PAGE_SIZE) break;
      }
    }
    try {
      await state.store(SETS_KEY, { at: Date.now(), ages });
    } catch (e) {
    }
    return ages;
  }

  async _rated(results) {
    let ages = {};
    try {
      ages = await this._ratingSets();
    } catch (e) {
      ages = {};
    }
    return results.map((r) => ({ ...r, ageRating: ages[r.mangaId] || 0 }));
  }

  async _get(path, allow403) {
    return this._request('GET', path, null, allow403);
  }

  async _post(path, body) {
    return this._request('POST', path, body, false);
  }

  async _request(method, path, body, allow403) {
    const manager = App.createRequestManager({});
    const headers = { 'User-Agent': UA, Accept: 'application/json' };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers.Origin = SITE_BASE;
      headers.Referer = SITE_BASE + '/';
    }
    const request = App.createRequest({ url: SITE_BASE + path, method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = await manager.schedule(request);
    if (allow403 && response.status === 403) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`Rolia Scan HTTP ${response.status} for ${path.split('?')[0]}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('Rolia Scan answered something that is not JSON for ' + path.split('?')[0]);
    }
  }
}

module.exports = { Source };
