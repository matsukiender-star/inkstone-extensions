const SITE_BASE = 'https://es.mangacrab.org';
const API_BASE = `${SITE_BASE}/api/mv`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', feed: 'updated' },
  { id: 'popular', name: 'Popular (Monthly)', feed: 'discover', ranking: 'monthly' },
  { id: 'weekly', name: 'Popular (Weekly)', feed: 'discover', ranking: 'weekly' },
  { id: 'new', name: 'New Series', feed: 'new' },
  { id: 'discover', name: 'Discover', feed: 'discover' },
];

const GENRES = [
  { id: 'accion', label: 'Acción' },
  { id: 'apocaliptico', label: 'Apocalíptico' },
  { id: 'artes-marciales', label: 'Artes Marciales' },
  { id: 'aventura', label: 'Aventura' },
  { id: 'ciencia-ficcion', label: 'Ciencia Ficción' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'cultivo', label: 'Cultivo' },
  { id: 'demonios', label: 'Demonios' },
  { id: 'deporte', label: 'Deporte' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'escolar', label: 'Escolar' },
  { id: 'fantasia', label: 'Fantasía' },
  { id: 'gore', label: 'Gore' },
  { id: 'guerra', label: 'Guerra' },
  { id: 'harem', label: 'Harem' },
  { id: 'historico', label: 'Histórico' },
  { id: 'horror', label: 'Horror' },
  { id: 'isekai', label: 'Isekai' },
  { id: 'magia', label: 'Magia' },
  { id: 'manga', label: 'Manga' },
  { id: 'manhua', label: 'Manhua' },
  { id: 'manhwa', label: 'Manhwa' },
  { id: 'mazmorras', label: 'Mazmorras' },
  { id: 'mecha', label: 'Mecha' },
  { id: 'misterio', label: 'Misterio' },
  { id: 'murim', label: 'Murim' },
  { id: 'psicologico', label: 'Psicológico' },
  { id: 'reencarnacion', label: 'Reencarnación' },
  { id: 'regresion', label: 'Regresión' },
  { id: 'romance', label: 'Romance' },
  { id: 'seinen', label: 'Seinen' },
  { id: 'shounen', label: 'Shounen' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'sobrenatural', label: 'Sobrenatural' },
  { id: 'supervivencia', label: 'Supervivencia' },
  { id: 'suspenso', label: 'Suspenso' },
  { id: 'venganza', label: 'Venganza' },
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  if (!html) return '';
  return cleanText(cheerio.load(String(html)).text());
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function mapStatus(raw) {
  const s = cleanText(raw).toLowerCase();
  if (s === 'end' || s.indexOf('finaliz') >= 0 || s.indexOf('complet') >= 0) return 'COMPLETED';
  if (s === 'on-hold' || s.indexOf('hiato') >= 0 || s.indexOf('pausa') >= 0) return 'HIATUS';
  if (s === 'canceled' || s.indexOf('cancel') >= 0) return 'CANCELLED';
  return 'ONGOING';
}

function parseChapterNumber(ch, fallback) {
  const direct = parseFloat(String(ch && ch.number !== undefined ? ch.number : ''));
  if (Number.isFinite(direct)) return direct;
  const label = cleanText((ch && (ch.title || ch.label)) || '');
  const m = label.match(/(?:cap[íi]tulo|cap\.?|ch\.?|ep\.?)\s*#?\s*(\d+(?:\.\d+)?)/i) || label.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const tags = ((request && request.includedTags) || [])
      .map((t) => cleanText(t && (t.id || t.label)).toLowerCase())
      .filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    const params = [
      `page=${page}`,
      'per_page=24',
      'nsfw=false',
      'nsfw_only=false',
    ];
    if (query) {
      params.push(`search=${encodeURIComponent(query)}`);
    } else {
      params.push(`feed=${encodeURIComponent(feed.feed)}`);
      if (feed.ranking) params.push(`ranking=${encodeURIComponent(feed.ranking)}`);
    }
    if (tags.length > 0) params.push(`genres=${encodeURIComponent(tags.join(','))}`);

    const json = await this.requestJSON(`${API_BASE}/mangas?${params.join('&')}`);
    const items = Array.isArray(json && json.items) ? json.items : [];
    const results = [];
    const seen = new Set();

    items.forEach((it) => {
      if (!it || !it.id) return;
      const mangaId = String(it.id);
      if (seen.has(mangaId)) return;
      const title = cleanText(it.title);
      const image = absolute(it.cover);
      if (!title || !image) return;
      seen.add(mangaId);
      const desc = stripHtml(it.description || it.excerpt);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        summary: desc || undefined,
        webURL: absolute(it.permalink || `${SITE_BASE}/mangas`),
        medium: 'comics',
      });
    });

    const pag = (json && json.pagination) || {};
    const hasNext = Boolean(pag.has_next) && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const it = await this.requestJSON(`${API_BASE}/mangas/${encodeURIComponent(mangaId)}`);
    const title = cleanText(it && it.title) || String(mangaId);
    const image = absolute(it && it.cover);
    const desc = stripHtml(it && (it.description || it.excerpt)) || title;
    const status = mapStatus(it && it.status && (it.status.raw || it.status.label));
    const tags = [];
    const rawGenres = Array.isArray(it && it.genres) ? it.genres : [];
    rawGenres.forEach((g) => {
      const name = cleanText(g && g.name);
      if (name && tags.indexOf(name) < 0) tags.push(name);
    });
    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        desc,
        status,
        completed: status === 'COMPLETED',
        tags,
        webURL: absolute((it && it.permalink) || `${SITE_BASE}/mangas`),
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const json = await this.requestJSON(`${API_BASE}/mangas/${encodeURIComponent(mangaId)}/chapters?per_page=5000`);
    const items = Array.isArray(json && json.items) ? json.items : [];
    const rows = [];
    const seen = new Set();
    const total = items.length;

    items.forEach((c, pos) => {
      if (!c) return;
      if (c.is_locked || c.is_vip_chapter) return;
      const idx = c.index !== undefined && c.index !== null ? String(c.index) : String(pos);
      if (seen.has(idx)) return;
      seen.add(idx);
      const name = cleanText(c.title || c.label) || `Capítulo ${total - pos}`;
      const number = parseChapterNumber(c, total - pos);
      const ts = Number(c.schedule_ts);
      const time = Number.isFinite(ts) && ts > 0 ? ts * 1000 : undefined;
      rows.push({ id: idx, name, number, time, order: total - pos });
    });

    rows.sort((a, b) => (a.number !== b.number ? a.number - b.number : a.order - b.order));
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const out = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time) out.time = r.time;
      return out;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this.requestJSON(
      `${API_BASE}/mangas/${encodeURIComponent(mangaId)}/chapter?cap_index=${encodeURIComponent(chapterId)}`
    );
    const list = (json && json.content && Array.isArray(json.content.pages)) ? json.content.pages : [];
    const pages = list.map((u) => absolute(u)).filter(Boolean);
    if (pages.length === 0) throw new Error('MangaCrab returned no pages for this chapter');
    const headers = {
      Referer: SITE_BASE + '/',
      Origin: SITE_BASE,
    };
    const sec = json && json.security;
    if (sec && sec.header) headers.Fansy = String(sec.header);
    return {
      id: chapterId,
      mangaId,
      pages,
      referer: SITE_BASE + '/',
      headers,
    };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaCrab HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
