const SITE_BASE = 'https://novelarchive.cc';
const API_BASE = `${SITE_BASE}/api`;
const PAGE_SIZE = 30;
const FEED_LIMIT = 50;

const EXPLICIT_GENRES = new Set([
  'adult',
  'adult drama',
  'smut',
  'erotica',
  'explicit sex',
  'r-18',
  'r18',
  'sexy kahani',
  'sex slavery',
  'rape',
  'incest',
  'hentai',
  'nsfw',
  '18+',
]);

const SUGGESTIVE_GENRES = new Set(['mature', 'ecchi', 'nudity', 'sex work', 'gore']);

const BLOCKED_GENRES = ['loli', 'lolicon', 'shota', 'shotacon'];

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', endpoint: '/novels/recently-updated' },
  { id: 'popular', name: 'Popular', sort: 'popular' },
  { id: 'trending', name: 'Trending', endpoint: '/novels/trending' },
  { id: 'newest', name: 'New Additions', sort: 'recent' },
  { id: 'top-rated', name: 'Top Rated', sort: 'rating' },
  { id: 'editors-choice', name: "Editor's Choice", endpoint: '/novels/editors-choice' },
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

function absUrl(path) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_BASE}${path.charAt(0) === '/' ? '' : '/'}${path}`;
}

function genresOf(novel) {
  return String((novel && novel.genres) || '')
    .split(',')
    .map((g) => cleanText(g))
    .filter(Boolean);
}

function isBlocked(novel) {
  return genresOf(novel).some((g) => BLOCKED_GENRES.indexOf(g.toLowerCase()) !== -1);
}

function ageRatingFor(novel) {
  let age = 0;
  genresOf(novel).forEach((g) => {
    const key = g.toLowerCase();
    if (EXPLICIT_GENRES.has(key)) age = 18;
    else if (SUGGESTIVE_GENRES.has(key) && age < 16) age = 16;
  });
  return age;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancel') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function authorOf(novel) {
  const a = cleanText(novel && novel.author);
  return a && a.toLowerCase() !== 'unknown' ? a : undefined;
}

function plainDescription(text) {
  let s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (/<[a-z/][^>]*>/i.test(s)) s = cheerio.load(`<div>${s}</div>`)('div').text();
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function toPartialManga(novel) {
  const genres = genresOf(novel);
  const chapters = parseInt(novel.total_chapters, 10);
  const status = mapStatus(novel.release_status);
  const manga = {
    mangaId: String(novel.id),
    title: cleanText(novel.title) || String(novel.id),
    image: absUrl(novel.cover_url || novel.image_url || novel.novel_image),
    status,
    completed: status === 'COMPLETED',
    ageRating: ageRatingFor(novel),
    webURL: `${SITE_BASE}/novel?id=${novel.id}`,
    medium: 'novel',
  };
  const author = authorOf(novel);
  if (author) manga.author = author;
  if (genres.length) manga.tags = genres;
  if (chapters > 0) manga.chapters = chapters;
  if (typeof novel.rating === 'number' && novel.rating > 0) manga.rating = novel.rating;
  return manga;
}

function chapterText(blocks, name) {
  const lines = blocks.map((b) => cleanText(b)).filter(Boolean);
  const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (lines.length > 1 && name && squash(lines[0]) === squash(name)) lines.shift();
  return lines.join('\n\n');
}

function htmlBlocks(html) {
  const $ = cheerio.load(String(html || ''));
  const images = $('img').length;
  $('script, style, img').remove();
  $('br').replaceWith('\n');
  const blocks = [];
  $('p, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
    String($(el).text())
      .split(/\n/)
      .forEach((line) => blocks.push(line));
  });
  if (blocks.filter((b) => cleanText(b)).length === 0) {
    String($.root().text())
      .split(/\n/)
      .forEach((line) => blocks.push(line));
  }
  return { blocks, images };
}

class Source {
  constructor() {
    this._novels = new Map();
    this._genres = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      if (!this._genres) {
        const json = await this._get('/novels/genres');
        const seen = new Set();
        this._genres = (Array.isArray(json && json.genres) ? json.genres : [])
          .filter((g) => g && typeof g.value === 'string' && /^[a-z0-9]/i.test(g.value))
          .filter((g) => BLOCKED_GENRES.indexOf(g.value.toLowerCase()) === -1)
          .filter((g) => (seen.has(g.value) ? false : seen.add(g.value)))
          .map((g) => ({ id: g.value, label: cleanText(g.label) || g.value }));
      }
      return this._genres;
    } catch (e) {
      console.error('NovelArchive getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };

    const page = Math.max(1, (metadata && metadata.page) || 1);
    const query = cleanText(request && request.title);
    const include = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const exclude = ((request && request.excludedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[1];

    if (feed.endpoint && !query && include.length === 0 && exclude.length === 0) {
      const json = await this._get(`${feed.endpoint}?limit=${FEED_LIMIT}`);
      const list = Array.isArray(json && json.novels) ? json.novels : [];
      return { results: list.filter((n) => !isBlocked(n)).map(toPartialManga), metadata: undefined };
    }

    const params = [`page=${page}`, `per_page=${PAGE_SIZE}`];
    if (query) params.push(`search=${encodeURIComponent(query)}`, 'fuzzy=1');
    else if (feed.sort && feed.sort !== 'recent') params.push(`sort=${feed.sort}`);
    if (include.length) params.push(`genres_include=${encodeURIComponent(include.join(','))}`);
    params.push(`genres_exclude=${encodeURIComponent(exclude.concat(BLOCKED_GENRES).join(','))}`);

    const json = await this._get(`/novels?${params.join('&')}`);
    const list = Array.isArray(json && json.novels) ? json.novels : [];
    const results = list.filter((n) => !isBlocked(n)).map(toPartialManga);
    const hasNext = !!(json && json.pagination && json.pagination.has_next) && list.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const novel = await this._novel(mangaId);
    const info = toPartialManga(novel);
    const chapters = Math.max(this._names(novel).length, parseInt(novel.total_chapters, 10) || 0);
    return {
      mangaInfo: {
        ...info,
        desc: plainDescription(novel.description) || undefined,
        chapters: chapters > 0 ? chapters : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    const novel = await this._novel(mangaId);
    const names = this._names(novel);
    const count = Math.max(names.length, parseInt(novel.total_chapters, 10) || 0);
    const chapters = [];
    for (let n = count; n >= 1; n -= 1) {
      chapters.push({
        id: String(n),
        chapterId: String(n),
        name: cleanText(names[n - 1]) || `Chapter ${n}`,
        number: n,
      });
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const number = parseInt(chapterId, 10);
    if (!(number >= 1)) throw new Error(`NovelArchive: ${chapterId} is not a chapter number`);
    const id = encodeURIComponent(mangaId);

    let text = '';
    let missing = null;
    try {
      const json = await this._get(`/novels/${id}/chapters/${number}?prefetch=1`);
      const chapter = (json && json.chapter) || {};
      text = chapterText(String(chapter.content || '').replace(/\r\n?/g, '\n').split('\n'), chapter.name);
    } catch (e) {
      if (!/HTTP 404/.test(String(e && e.message))) throw e;
      missing = e;
    }
    if (text) return { id: chapterId, mangaId, pages: [], text };

    let sources = [];
    try {
      const json = await this._get(`/novels/${id}/sources`);
      sources = Array.isArray(json && json.sources) ? json.sources : [];
    } catch (e) {
      sources = [];
    }
    let pictures = 0;
    for (let i = 0; i < sources.length; i += 1) {
      let json = null;
      try {
        json = await this._get(`/novels/${id}/sources/${encodeURIComponent(sources[i].id)}/chapters/${number}`);
      } catch (e) {
        continue;
      }
      const { blocks, images } = htmlBlocks(json && json.content_html);
      const body = chapterText(blocks, json && json.title);
      if (body) return { id: chapterId, mangaId, pages: [], text: body };
      pictures = Math.max(pictures, images);
    }
    if (pictures > 0) {
      return {
        id: chapterId,
        mangaId,
        pages: [],
        text:
          `This chapter is only ${pictures === 1 ? 'an illustration' : `${pictures} illustrations`}, ` +
          `and the text reader cannot show pictures.\n\nIt can be opened on the site: ${SITE_BASE}/reader?novel=${mangaId}&chapter=${number}`,
      };
    }
    throw missing || new Error('NovelArchive returned no text for this chapter');
  }

  _novel(mangaId) {
    const hit = this._novels.get(mangaId);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this._get(`/novels/${encodeURIComponent(mangaId)}`)
      .then((json) => {
        const novel = json && json.novel;
        if (!novel) throw new Error('NovelArchive: no such title');
        if (isBlocked(novel)) throw new Error('This title is not available in this source.');
        return novel;
      })
      .catch((e) => {
        this._novels.delete(mangaId);
        throw e;
      });
    this._novels.set(mangaId, { at: Date.now(), promise });
    return promise;
  }

  _names(novel) {
    return Array.isArray(novel && novel.chapter_names) ? novel.chapter_names : [];
  }

  async _get(path) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
    const request = App.createRequest({
      url: `${API_BASE}${path}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      let reason = '';
      try {
        reason = ` (${parseJsonBody(response.data).error})`;
      } catch (e) {
        reason = '';
      }
      throw new Error(`NovelArchive HTTP ${response.status}${reason}`);
    }
    return parseJsonBody(response.data);
  }
}

module.exports = { Source };
