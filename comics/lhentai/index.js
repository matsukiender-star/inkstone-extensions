const SITE_BASE = 'https://lhentai.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/browse' },
];

const GENRES = [
  { id: 'full-color', label: 'Full Color' },
  { id: 'big-breasts', label: 'Big Breasts' },
  { id: 'sole-female', label: 'Sole Female' },
  { id: 'sole-male', label: 'Sole Male' },
  { id: 'milf', label: 'MILF' },
  { id: 'stockings', label: 'Stockings' },
  { id: 'schoolgirl-uniform', label: 'Schoolgirl Uniform' },
  { id: 'group', label: 'Group' },
  { id: 'nakadashi', label: 'Nakadashi' },
  { id: 'blowjob', label: 'Blowjob' },
  { id: 'paizuri', label: 'Paizuri' },
  { id: 'anal', label: 'Anal' },
  { id: 'yuri', label: 'Yuri' },
  { id: 'yaoi', label: 'Yaoi' },
  { id: 'harem', label: 'Harem' },
  { id: 'netorare', label: 'Netorare' },
  { id: 'incest', label: 'Incest' },
  { id: 'monster-girl', label: 'Monster Girl' },
  { id: 'elf', label: 'Elf' },
  { id: 'uncensored', label: 'Uncensored' },
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

function extractId(url) {
  const m = String(url || '').match(/\/g\/(\d+)/);
  return m ? m[1] : '';
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
    const tags = ((request && request.includedTags) || [])
      .map((t) => cleanText(t && (t.id || t.label)).toLowerCase())
      .filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/browse?q=${encodeURIComponent(query)}&page=${page}`;
    } else if (tags.length > 0) {
      url = `${SITE_BASE}/tag/${encodeURIComponent(tags[0])}?page=${page}`;
    } else {
      url = `${SITE_BASE}/browse?page=${page}`;
    }

    const res = await this.fetchHTML(url, true);
    if (res.status === 404) return { results: [] };
    const $ = cheerio.load(res.data);
    const results = [];
    const seen = new Set();

    $('a.grid-card[href^="/g/"], a[href^="/g/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const mangaId = extractId(href);
      if (!mangaId || seen.has(mangaId)) return;
      const imgEl = $(el).find('img').first();
      const image = absolute(imgEl.attr('src') || imgEl.attr('data-src'));
      const aria = cleanText($(el).find('[aria-label]').first().attr('aria-label')).replace(/^Portada de\s+/i, '');
      const title = cleanText($(el).find('.grid-card__title, h2, h3').first().text() || aria || imgEl.attr('alt'));
      if (!title || !image) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/g/${mangaId}`,
        medium: 'comics',
        ageRating: 18,
      });
    });

    const hasNext = results.length >= 20 && $(`a[href*="page=${page + 1}"]`).length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/g/${encodeURIComponent(mangaId)}`;
    const res = await this.fetchHTML(url);
    const $ = cheerio.load(res.data);
    const title = cleanText($('h1').first().text()) || `Galería ${mangaId}`;
    const coverImg = $('img[src*="/api/media/"][src*="cover"]').first();
    const image = absolute(coverImg.attr('src') || $('img[src*="/api/media/"]').first().attr('src'));
    const tags = [];
    $('a[href^="/tag/"]').each((_, el) => {
      const t = cleanText($(el).text()).replace(/\s+\d[\d,.]*\s*$/, '');
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const authors = [];
    $('a[href^="/artist/"]').each((_, el) => {
      const a = cleanText($(el).text()).replace(/\s+\d[\d,.]*\s*$/, '');
      if (a && authors.indexOf(a) < 0) authors.push(a);
    });
    const desc = tags.length > 0 ? `Etiquetas: ${tags.join(', ')}` : title;
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      desc,
      status: 'COMPLETED',
      completed: true,
      tags,
      webURL: url,
      medium: 'comics',
      ageRating: 18,
    };
    if (authors.length > 0) info.author = authors.join(', ');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    return [
      {
        id: String(mangaId),
        chapterId: String(mangaId),
        name: 'Galería completa',
        number: 1,
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/g/${encodeURIComponent(mangaId)}`;
    const res = await this.fetchHTML(url, false, SITE_BASE + '/');
    const $ = cheerio.load(res.data);
    const pages = [];
    const seen = new Set();

    $('img[src*="/api/media/"], img[data-src*="/api/media/"]').each((_, el) => {
      const raw = $(el).attr('src') || $(el).attr('data-src') || '';
      if (!raw || /cover\./i.test(raw)) return;
      const full = absolute(raw.replace(/\?.*$/, ''));
      if (full && !seen.has(full)) {
        seen.add(full);
        pages.push(full);
      }
    });

    if (pages.length === 0) throw new Error('lHentai returned no pages for this gallery');
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
    if (response.status < 200 || response.status >= 300) throw new Error(`lHentai HTTP ${response.status}`);
    return response;
  }
}

module.exports = { Source };
