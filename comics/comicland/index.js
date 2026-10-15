const SITE_BASE = 'https://comicland.org';
const API_BASE = 'https://api.comicland.org/api';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 20;
const STATUS_KEY = 'status-sets-v1';
const STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const GENRES = [["3d","3D"],["action","Action"],["adapted-to-anime","Adapted to Anime"],["adult","Adult"],["adventure","Adventure"],["ai-art","AI Art"],["aliens","Aliens"],["animal-characteristics","Animal Characteristics"],["based-on-another-work","Based on Another Work"],["bl","BL"],["borderline-h","Borderline H"],["cohabitation","Cohabitation"],["collection-of-stories","Collection of Stories"],["comedy","Comedy"],["comics","Comics"],["cooking","Cooking"],["coworkers","Coworkers"],["crime","Crime"],["crossdressing","Crossdressing"],["delinquents","Delinquents"],["demons","Demons"],["detectives","Detectives"],["doujinshi","Doujinshi"],["drama","Drama"],["ecchi","Ecchi"],["explicit-sex","Explicit Sex"],["fantasy","Fantasy"],["fetish","Fetish"],["full-color","Full Color"],["gender-bender","Gender Bender"],["ghosts","Ghosts"],["gl","GL"],["gyaru","Gyaru"],["harem","Harem"],["hentai","Hentai"],["historical","Historical"],["horror","Horror"],["incest","Incest"],["isekai","Isekai"],["japanese-webtoons","Japanese Webtoons"],["josei","Josei"],["mafia","Mafia"],["magic","Magic"],["magical-girl","Magical Girl"],["manhua","Manhua"],["manhwa","Manhwa"],["martial-arts","Martial Arts"],["mature","Mature"],["mature-romance","Mature Romance"],["medical","Medical"],["military","Military"],["monster-girls","Monster Girls"],["monsters","Monsters"],["motion","Motion"],["music","Music"],["mystery","Mystery"],["nudity","Nudity"],["oel","OEL"],["office-workers","Office Workers"],["one-shot","One Shot"],["person-in-a-strange-world","Person in a Strange World"],["police","Police"],["psychological","Psychological"],["reincarnation","Reincarnation"],["reverse-harem","Reverse Harem"],["romance","Romance"],["salaryman","Salaryman"],["samurai","Samurai"],["school-life","School Life"],["sci-fi","Sci-fi"],["seinen","Seinen"],["sexual-abuse","Sexual Abuse"],["sexual-content","Sexual Content"],["shoujo","Shoujo"],["shoujo-ai","Shoujo-ai"],["shounen","Shounen"],["siblings","Siblings"],["slice-of-life","Slice of Life"],["smut","Smut"],["sports","Sports"],["summoned-into-another-world","Summoned Into Another World"],["supernatural","Supernatural"],["survival","Survival"],["thriller","Thriller"],["time-travel","Time Travel"],["transfer-students","Transfer Students"],["uncensored","Uncensored"],["vampires","Vampires"],["violence","Violence"],["virtual-reality","Virtual Reality"],["webtoons","Webtoons"],["western","Western"],["work-life","Work Life"],["yaoi","Yaoi"],["yuri","Yuri"],["zombies","Zombies"]];

const EXPLICIT_GENRES = new Set(['explicit-sex', 'uncensored', 'smut', 'adult', 'hentai', 'incest', 'sexual-abuse', 'fetish']);
const SUGGESTIVE_GENRES = new Set(['mature', 'mature-romance', 'borderline-h', 'ecchi', 'sexual-content', 'nudity']);

const FEEDS = {
  ongoing: { path: '/comics', params: { status: 'ongoing' }, key: 'list' },
  all: { path: '/comics', params: {}, key: 'list' },
  completed: { path: '/comics', params: { status: 'completed' }, key: 'list' },
  hiatus: { path: '/comics', params: { status: 'hiatus' }, key: 'list' },
  official: { path: '/comics/official', params: {}, key: 'items' },
  uncensored: { path: '/comic/search', params: { q: 'uncensored' }, key: 'items', size: SEARCH_PAGE_SIZE },
  popular: { path: '/comics/popular', params: {}, key: 'list', unpaged: true },
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function ratingOf(genres) {
  if (genres.some((g) => EXPLICIT_GENRES.has(g.slug))) return 18;
  if (genres.some((g) => SUGGESTIVE_GENRES.has(g.slug))) return 16;
  return undefined;
}

function toPartialManga(item) {
  return {
    mangaId: item.slug,
    title: item.title,
    image: item.cover_url || undefined,
    rating: typeof item.rating === 'number' && item.rating > 0 ? Math.round(item.rating * 20) / 10 : undefined,
    medium: 'comics',
    webURL: `${SITE_BASE}/comic/${item.slug}`,
  };
}

class Source {
  constructor() {
    this._statusSets = null;
    this._statusLoading = null;
    this._details = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'ongoing', name: 'Ongoing' },
      { id: 'popular', name: 'Popular' },
      { id: 'official', name: 'Official' },
      { id: 'uncensored', name: 'Uncensored' },
      { id: 'all', name: 'All Titles' },
      { id: 'completed', name: 'Completed' },
      { id: 'hiatus', name: 'On Hiatus' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const title = ((request && request.title) || '').trim();
    const feed = (request && request.feed) || 'ongoing';
    const offset = Math.max(0, (metadata && metadata.offset) || 0);
    const genre = ((request && request.includedTags) || []).find((t) => t && t.id);

    if (title) {
      return this._page('/comic/search', { q: title }, 'items', offset, SEARCH_PAGE_SIZE);
    }
    if (genre) {
      return this._page('/comics_by_genre', { name: genre.id }, 'list', offset, PAGE_SIZE);
    }
    const how = FEEDS[feed] || FEEDS.ongoing;
    if (how.unpaged) {
      const json = await this._json(how.path);
      const list = (json.data && json.data[how.key]) || [];
      return { results: list.filter((i) => i && i.slug).map(toPartialManga), metadata: undefined };
    }
    return this._page(how.path, how.params, how.key, offset, how.size || PAGE_SIZE);
  }

  async _page(path, params, key, offset, size) {
    const json = await this._json(`${path}?${qs({ ...params, offset, limit: size })}`);
    const data = json.data || {};
    const list = Array.isArray(data[key]) ? data[key] : [];
    const more = typeof data.has_more === 'boolean' ? data.has_more : list.length >= size;
    return {
      results: list.filter((i) => i && i.slug).map(toPartialManga),
      metadata: more && list.length > 0 ? { offset: offset + list.length } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const [data, status] = await Promise.all([this._detail(mangaId), this._statusOf(mangaId)]);
    const genres = Array.isArray(data.genres) ? data.genres.filter((g) => g && g.name) : [];
    const people = []
      .concat(Array.isArray(data.authors) ? data.authors : [])
      .concat(Array.isArray(data.artists) ? data.artists : [])
      .map((p) => p && p.name)
      .filter((n) => typeof n === 'string' && n.trim());
    const info = {
      ...toPartialManga(data),
      desc: (data.description || '').trim() || undefined,
      author: [...new Set(people.map((n) => n.trim()))].join(' / ') || undefined,
      tags: genres.map((g) => g.name),
      status,
      completed: status === 'COMPLETED',
      chapters: Array.isArray(data.chapters) ? data.chapters.length : undefined,
    };
    const age = ratingOf(genres);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this._detail(mangaId);
    const rows = Array.isArray(data.chapters) ? data.chapters : [];
    const chapters = [];
    const seen = new Set();
    rows.forEach((c) => {
      if (!c || typeof c.chapter_index !== 'number') return;
      const id = String(c.chapter_index);
      if (seen.has(id)) return;
      seen.add(id);
      chapters.push({
        id,
        chapterId: id,
        name: typeof c.title === 'string' && c.title ? c.title : `Chapter ${id}`,
        number: c.chapter_index,
      });
    });
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._json(
      `/chapter/pages_by_index?${qs({ slug: mangaId, index: parseInt(chapterId, 10) })}`,
    );
    const data = json.data || {};
    const pages = (Array.isArray(data.pages) ? data.pages : []).filter((u) => typeof u === 'string' && u);
    if (data.chapter_id === 0 || pages.length === 0) {
      throw new Error('ComicLand returned no pages for this chapter');
    }
    return { id: chapterId, mangaId, pages };
  }

  async _detail(mangaId) {
    const hit = this._details.get(mangaId);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this._json(`/comic/detail?${qs({ slug: mangaId })}`).then((json) => {
      if (!json.data || !json.data.slug) throw new Error('ComicLand: title not found');
      return json.data;
    });
    this._details.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this._details.delete(mangaId));
    return promise;
  }

  async _statusOf(mangaId) {
    try {
      const sets = await this._status();
      if (sets.ongoing.has(mangaId)) return 'ONGOING';
      if (sets.hiatus.has(mangaId)) return 'HIATUS';
      return 'COMPLETED';
    } catch (e) {
      return 'UNKNOWN';
    }
  }

  async _status() {
    if (this._statusSets) return this._statusSets;
    if (!this._statusLoading) {
      this._statusLoading = this._loadStatus().then(
        (sets) => {
          this._statusLoading = null;
          this._statusSets = sets;
          return sets;
        },
        (e) => {
          this._statusLoading = null;
          throw e;
        },
      );
    }
    return this._statusLoading;
  }

  async _loadStatus() {
    const state = App.createSourceStateManager();
    let saved = null;
    try {
      saved = await state.retrieve(STATUS_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved && typeof saved.at === 'number' && Date.now() - saved.at < STATUS_MAX_AGE_MS && saved.ongoing && saved.hiatus) {
      return { ongoing: new Set(saved.ongoing), hiatus: new Set(saved.hiatus) };
    }
    const slugs = async (status) => {
      const json = await this._json(`/comics?${qs({ status, offset: 0, limit: 500 })}`);
      const list = (json.data && json.data.list) || [];
      if (list.length >= 500) throw new Error('ComicLand status list is longer than one page');
      return list.map((i) => i.slug);
    };
    const [ongoing, hiatus] = await Promise.all([slugs('ongoing'), slugs('hiatus')]);
    try {
      await state.store(STATUS_KEY, { at: Date.now(), ongoing, hiatus });
    } catch (e) {
    }
    return { ongoing: new Set(ongoing), hiatus: new Set(hiatus) };
  }

  async _json(path) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url: API_BASE + path,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Origin: SITE_BASE,
        Referer: SITE_BASE + '/',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ComicLand HTTP ${response.status} for ${path}`);
    }
    const json = JSON.parse(response.data);
    if (json && typeof json.code === 'number' && json.code !== 0 && json.code !== 200) {
      throw new Error(`ComicLand: ${json.message || 'error ' + json.code}`);
    }
    return json;
  }
}

module.exports = { Source };
