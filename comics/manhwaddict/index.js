const CONFIG = {
  "name": "Manhwaddict",
  "origin": "https://manhwaddict.com",
  "mangaPath": "manga",
  "searchParam": "q",
  "referer": true,
  "imageHeaders": false,
  "genres": "none"
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const ADULT_GENRE = /^(adult|hentai|smut|erotica|nsfw|18\+|sexual content|uncensored)$/i;
const SUGGESTIVE_GENRE = /^(mature|ecchi|borderline h)$/i;

function isBlockedGenre(name) {
  const n = String(name || '').trim().toLowerCase();
  return /loli|shota/.test(n) && n !== 'loli' && n !== 'shota';
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('completed') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  return 'UNKNOWN';
}

function parseDate(text) {
  const m = /^(?:(\d{1,2})\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{2,4})$/.exec(cleanText(text));
  if (!m) return undefined;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return undefined;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return Date.UTC(year, month, m[1] ? Number(m[1]) : 1);
}

function withImageAuth(target) {
  if (CONFIG.imageHeaders) target.headers = { 'User-Agent': UA, Referer: SITE_BASE + '/' };
  else if (CONFIG.referer) target.referer = SITE_BASE + '/';
  return target;
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:/i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function slugOf(href) {
  const parts = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].split('/').filter(Boolean);
  const at = parts.indexOf(CONFIG.mangaPath);
  return at >= 0 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : '';
}

function listUrl(segments, page) {
  const path = (page > 1 ? segments.concat(['page', String(page)]) : segments).map(encodeURIComponent).join('/');
  return `${SITE_BASE}/${path}${path ? '/' : ''}`;
}

class Source {
  constructor() {
    this._genres = null;
  }

  getSourceFeeds() {
    const feeds = [{ id: 'latest', name: 'Latest Updates' }];
    if (CONFIG.popularPath || CONFIG.popularHome) feeds.push({ id: 'popular', name: 'Popular' });
    return feeds;
  }

  async getSearchTags() {
    if (CONFIG.genres === 'none') return [];
    if (this._genres) return this._genres;
    try {
      const $ = cheerio.load(await this.requestHTML(SITE_BASE + '/'));
      const seen = new Set();
      const tags = [];
      $('.genre-list a, a.item-nav[href*="/genre/"], a.item-nav-mb[href*="/genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = /\/genre\/([^/?#]+)/.exec(href);
        const label = cleanText($(el).text());
        if (!m || !label || seen.has(m[1]) || isBlockedGenre(label)) return;
        seen.add(m[1]);
        tags.push({ id: m[1], label });
      });
      tags.sort((a, b) => a.label.localeCompare(b.label));
      this._genres = tags;
      return tags;
    } catch (e) {
      console.error(CONFIG.name + ' getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = cleanText((request && request.title) || '');
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const genre = ((request && request.includedTags) || []).find((t) => t && t.id);
    const feed = (request && request.feed) || 'latest';

    let url;
    if (title) url = `${SITE_BASE}/search/?${encodeURIComponent(CONFIG.searchParam || 's')}=${encodeURIComponent(title)}&page=${page}`;
    else if (genre) url = listUrl(['genre', String(genre.id)], page);
    else if (feed === 'popular' && CONFIG.popularPath) url = listUrl([CONFIG.popularPath], page) + '?order=views';
    else if (feed === 'popular' && CONFIG.popularHome) url = SITE_BASE + '/';
    else url = listUrl([], page);

    const $ = cheerio.load(await this.requestHTML(url));
    const results = [];
    const seen = new Set();
    const rows = feed === 'popular' && !title && !genre && CONFIG.popularHome ? $('.item-move') : $('.latest-list .latest-item, .list .list-item');
    rows.each((_, el) => {
      const e = $(el);
      const link = e.find('.latest-right a:has(h3, h4), .item-title a, .name a').first();
      let id = '';
      e.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (!id) id = slugOf(href) || decodeURIComponent((/[?&]slug=([^&#]+)/.exec(href) || [])[1] || '');
      });
      if (!id || seen.has(id)) return;
      seen.add(id);
      const manga = {
        mangaId: id,
        title: cleanText(link.text()) || id,
        medium: 'comics',
        webURL: `${SITE_BASE}/${CONFIG.mangaPath}/${encodeURIComponent(id)}/`,
      };
      const img = e.find('.latest-left img, .item-img img, img').first();
      const src = absolute(img.attr('data-src') || img.attr('src'));
      if (src) manga.image = src;
      withImageAuth(manga);
      results.push(manga);
    });
    const hasNext = $('#pagination li.next a').length > 0;
    return { results, metadata: hasNext && results.length > 0 && !(feed === 'popular' && !title && !genre && CONFIG.popularHome) ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/${CONFIG.mangaPath}/${encodeURIComponent(mangaId)}/`;
    const $ = cheerio.load(await this.requestHTML(url));
    const title = cleanText($('h1.main-info-title, .post-title h1, .manga-detail .info h1').first().text());
    if (!title) throw new Error(CONFIG.name + ': title not found');
    const info = (...labels) => {
      let found = null;
      $('.main-info-list li > h5, .post-content_item .summary-heading > h5, .info-item > span.sh').each((_, el) => {
        const label = cleanText($(el).text()).replace(/[:\-\s]+$/, '');
        if (!found && labels.indexOf(label) >= 0) found = $(el).closest('li, .post-content_item, .info-item');
      });
      return found;
    };
    const names = (row) => {
      if (!row) return [];
      const links = row.find('a');
      const out = [];
      (links.length ? links.map((_, a) => cleanText($(a).text())).get() : [cleanText(row.children().not('h5, .summary-heading, .sh').first().text())]).forEach((n) => {
        if (n && out.indexOf(n) < 0) out.push(n);
      });
      return out;
    };
    const tags = names(info('Genres', 'Genre(s)'));
    if (tags.some(isBlockedGenre)) throw new Error(CONFIG.name + ' does not serve this title: it carries a Lolicon or Shotacon style tag');
    const people = names(info('Author(s)', 'Author')).concat(names(info('Artist(s)', 'Artist'))).filter((n, i, a) => a.indexOf(n) === i && !/^(updating|n\/a|unknown)$/i.test(n));
    const statusRow = info('Status');
    const status = mapStatus(statusRow ? statusRow.text() : $('.manga-detail .info p.type').first().text());
    const block = $('.short-desc-content, .dsct, .description-summary').first();
    const paragraphs = [];
    block.find('p, li').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    if (paragraphs.length === 0 && block.length) {
      const t = cleanText(block.text());
      if (t) paragraphs.push(t);
    }
    const alt = cleanText((info('Alternative') || $()).find('p, div').first().text());
    const desc = paragraphs.concat(alt ? ['Alternative names: ' + alt] : []).join('\n\n');
    const cover = $('img.img-cover, .summary_image img, .manga-detail .poster img').first();
    const result = {
      title,
      image: absolute(cover.attr('data-src') || cover.attr('src')) || undefined,
      author: people.join(', ') || undefined,
      desc: desc || undefined,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    withImageAuth(result);
    if (tags.some((t) => ADULT_GENRE.test(t))) result.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) result.ageRating = 16;
    return { mangaInfo: result };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/${CONFIG.mangaPath}/${encodeURIComponent(mangaId)}/`));
    const rows = [];
    const seen = new Set();
    $('ul.chapter-list li, ul.row-content-chapter li, .list-items li.item').each((_, el) => {
      const li = $(el);
      const a = li.find('a[href]').first();
      const parts = (a.attr('href') || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].split('/').filter(Boolean);
      const at = parts.indexOf(CONFIG.mangaPath);
      const id = at >= 0 ? parts.slice(at + 2).join('~') : '';
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = cleanText(li.find('.chapter-name, .item a > span:first-child').first().text()) || id;
      const n = /(\d+(?:\.\d+)?)/.exec(name) || /(\d+(?:[-.]\d+)?)/.exec(id);
      const row = { id, chapterId: id, name, number: n ? parseFloat(n[1].replace('-', '.')) : 0 };
      const time = parseDate(li.find('.ct-update, .chapter-time, .item a > span:nth-child(2)').first().text());
      if (time !== undefined) row.time = time;
      rows.push(row);
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      return { ...r, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${CONFIG.mangaPath}/${encodeURIComponent(mangaId)}/${String(chapterId).split('~').map(encodeURIComponent).join('/')}/`;
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    const seen = new Set();
    $('.reading-content img, .read-content img').each((_, el) => {
      const e = $(el);
      const src = absolute(e.attr('data-src') || e.attr('data-lazy-src') || e.attr('src'));
      if (!src || /^data:/i.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(src);
    });
    if (pages.length === 0) throw new Error(CONFIG.name + ' returned no pages for this chapter');
    const details = { id: chapterId, mangaId, pages };
    withImageAuth(details);
    return details;
  }

  async requestHTML(url) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const request = App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
