const SITE_BASE = 'https://samurai.j5z.xyz';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', orderby: 'latest' },
  { id: 'popular', name: 'Popular', orderby: 'views' },
  { id: 'trending', name: 'Trending', orderby: 'trending' },
  { id: 'new', name: 'New Series', orderby: 'new-manga' },
];

const GENRES = [
  { id: 'accion', label: 'Acción' },
  { id: 'apocaliptico', label: 'Apocalíptico' },
  { id: 'artes-marciales', label: 'Artes Marciales' },
  { id: 'aventura', label: 'Aventura' },
  { id: 'ciencia-ficcion', label: 'Ciencia ficción' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'demonios', label: 'Demonios' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'fantasia', label: 'Fantasía' },
  { id: 'genio', label: 'Genio' },
  { id: 'harem', label: 'Harem' },
  { id: 'historia', label: 'Historia' },
  { id: 'horror', label: 'Horror' },
  { id: 'magia', label: 'Magia' },
  { id: 'militar', label: 'Militar' },
  { id: 'misterio', label: 'Misterio' },
  { id: 'natural', label: 'Natural' },
  { id: 'realidad-virtual', label: 'Realidad Virtual' },
  { id: 'recuentos-de-la-vida', label: 'Recuentos de la vida' },
  { id: 'reencarnacion', label: 'Reencarnación' },
  { id: 'romance', label: 'Romance' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'superpoderes', label: 'Superpoderes' },
  { id: 'supervivencia', label: 'Supervivencia' },
  { id: 'tragedia', label: 'Tragedia' },
  { id: 'venganza', label: 'Venganza' },
  { id: 'vida-escolar', label: 'Vida Escolar' },
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u || u.indexOf('data:') === 0) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function bestImg($, img) {
  const raw =
    $(img).attr('data-src') ||
    $(img).attr('data-lazy-src') ||
    $(img).attr('data-cfsrc') ||
    $(img).attr('src') ||
    '';
  return absolute(raw.trim());
}

function extractSlug(url) {
  const m = String(url || '').match(/\/son\/([^\/?#]+)/i);
  return m ? m[1] : '';
}

function mapStatus(raw) {
  const s = cleanText(raw).toLowerCase();
  if (s.indexOf('complet') >= 0 || s.indexOf('finaliz') >= 0 || s.indexOf('terminad') >= 0) return 'COMPLETED';
  if (s.indexOf('hiato') >= 0 || s.indexOf('pausa') >= 0 || s.indexOf('hold') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0) return 'CANCELLED';
  return 'ONGOING';
}

function parseChapterNumber(name, slug, fallback) {
  const m =
    String(name || '').match(/(?:cap[íi]tulo|cap\.?|ch\.?)\s*#?\s*(\d+(?:\.\d+)?)/i) ||
    String(slug || '').match(/capitulo-(\d+(?:-\d+)?)/i) ||
    String(name || '').match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const n = parseFloat(String(m[1]).replace('-', '.'));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
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

    let url;
    let isSearch = false;
    if (query) {
      isSearch = true;
      url = page > 1
        ? `${SITE_BASE}/page/${page}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        : `${SITE_BASE}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    } else if (tags.length > 0) {
      url = page > 1
        ? `${SITE_BASE}/l-generos/${encodeURIComponent(tags[0])}/page/${page}/?m_orderby=${feed.orderby}`
        : `${SITE_BASE}/l-generos/${encodeURIComponent(tags[0])}/?m_orderby=${feed.orderby}`;
    } else {
      url = page > 1
        ? `${SITE_BASE}/leer/page/${page}/?m_orderby=${feed.orderby}`
        : `${SITE_BASE}/leer/?m_orderby=${feed.orderby}`;
    }

    const res = await this.fetchHTML(url, true);
    if (res.status === 404) return { results: [] };
    const $ = cheerio.load(res.data);
    const results = [];
    const seen = new Set();

    const selector = isSearch ? '.c-tabs-item__content' : '.page-item-detail';
    $(selector).each((_, el) => {
      const a = $(el).find('.post-title a, h3 a, h4 a, .item-thumb a').first();
      const href = a.attr('href') || '';
      const mangaId = extractSlug(href);
      if (!mangaId || seen.has(mangaId)) return;
      const title = cleanText($(el).find('.post-title a, h3 a, h4 a').first().text() || a.attr('title'));
      const image = bestImg($, $(el).find('img').first());
      if (!title || !image) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: absolute(href),
        medium: 'comics',
      });
    });

    const hasNext =
      results.length > 0 &&
      ($('a.nextpostslink, .nav-previous a, a.next.page-numbers').length > 0 || results.length >= 10);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/son/${encodeURIComponent(mangaId)}/`;
    const res = await this.fetchHTML(url);
    const $ = cheerio.load(res.data);
    const title = cleanText($('.post-title h1, h1').first().text()) || mangaId;
    const image = bestImg($, $('.summary_image img').first());
    const descParas = [];
    $('.summary__content p, .description-summary p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParas.push(t);
    });
    const desc = descParas.join('\n\n') || cleanText($('.summary__content, .description-summary').first().text()) || title;
    const author = cleanText($('.author-content a').map((_, el) => cleanText($(el).text())).get().join(', '));
    const tags = [];
    $('.genres-content a').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) < 0) tags.push(g);
    });
    let statusRaw = '';
    $('.post-status .post-content_item, .post-content_item').each((_, el) => {
      const h = cleanText($(el).find('.summary-heading').text()).toLowerCase();
      if (h.indexOf('estado') >= 0 || h.indexOf('status') >= 0) {
        statusRaw = cleanText($(el).find('.summary-content').text());
      }
    });
    const status = mapStatus(statusRaw);
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (author) info.author = author;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const mangaUrl = `${SITE_BASE}/son/${encodeURIComponent(mangaId)}/`;
    const response = await this.requests.schedule(App.createRequest({
      url: `${mangaUrl}ajax/chapters/`,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Referer: mangaUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
    }));
    const $ = cheerio.load(response.data || '');
    const raw = [];
    const seen = new Set();

    $('li.wp-manga-chapter').each((_, el) => {
      const a = $(el).find('a').first();
      const href = absolute(a.attr('href'));
      if (!href) return;
      const m = href.match(/\/son\/[^\/]+\/([^\/?#]+)/i);
      const cid = m ? m[1] : href;
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const name = cleanText(a.text()) || cid;
      raw.push({ id: cid, name });
    });

    const total = raw.length;
    const rows = raw.map((c, idx) => ({
      id: c.id,
      name: c.name,
      number: parseChapterNumber(c.name, c.id, total - idx),
      order: total - idx,
    }));
    rows.sort((a, b) => (a.number !== b.number ? a.number - b.number : a.order - b.order));
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      return { id: r.id, chapterId: r.id, name: r.name, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const mangaUrl = `${SITE_BASE}/son/${encodeURIComponent(mangaId)}/`;
    const url = `${mangaUrl}${encodeURIComponent(chapterId)}/`;
    const res = await this.fetchHTML(url, false, mangaUrl);
    const $ = cheerio.load(res.data);
    const pages = [];
    $('.reading-content img.wp-manga-chapter-img, .reading-content .page-break img').each((_, el) => {
      const u = bestImg($, el);
      if (u && pages.indexOf(u) < 0) pages.push(u);
    });
    if (pages.length === 0) throw new Error('ManhuaOnline returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: url };
  }

  async fetchHTML(url, allow404, referer) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        Referer: referer || SITE_BASE + '/',
      },
    }));
    if (allow404 && response.status === 404) return response;
    if (response.status < 200 || response.status >= 300) throw new Error(`ManhuaOnline HTTP ${response.status}`);
    return response;
  }
}

module.exports = { Source };
