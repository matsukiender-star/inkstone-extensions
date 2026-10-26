const SITE_BASE = 'https://tcbonepiecechapters.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:/i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function idOf(href, kind) {
  const m = new RegExp('/' + kind + '/(\\d+)/([^/?#]+)').exec(String(href || ''));
  return m ? `${m[1]}~${decodeURIComponent(m[2])}` : '';
}

function pathOf(kind, id) {
  const [number, ...rest] = String(id).split('~');
  return `/${kind}/${encodeURIComponent(number)}/${rest.map(encodeURIComponent).join('/')}`;
}

class Source {
  getSourceFeeds() {
    return [{ id: 'projects', name: 'Projects' }];
  }

  async getSearchResults(request) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText((request && request.title) || '').toLowerCase();
    const $ = cheerio.load(await this._html('/projects'));
    const results = [];
    const seen = new Set();
    $('div.bg-card').each((_, el) => {
      const card = $(el);
      const link = card.find('a[href*="/mangas/"]').filter((_i, a) => cleanText($(a).text()) !== '').first();
      const id = idOf(link.attr('href'), 'mangas');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = cleanText(link.text());
      if (query && title.toLowerCase().indexOf(query) < 0) return;
      const image = absolute(card.find('img').first().attr('src'));
      results.push({
        mangaId: id,
        title,
        image: image || undefined,
        medium: 'comics',
        webURL: SITE_BASE + pathOf('mangas', id),
      });
    });
    return { results, metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this._html(pathOf('mangas', mangaId)));
    const box = $('div.order-1').first();
    const title = cleanText(box.find('h1').first().text());
    if (!title) throw new Error('TCB Scans: title not found');
    return {
      mangaInfo: {
        mangaId,
        title,
        image: absolute(box.find('img').first().attr('src')) || undefined,
        desc: cleanText(box.find('p').first().text()) || undefined,
        status: 'UNKNOWN',
        medium: 'comics',
        webURL: SITE_BASE + pathOf('mangas', mangaId),
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this._html(pathOf('mangas', mangaId)));
    const rows = [];
    const seen = new Set();
    $('a[href^="/chapters/"]').each((_, el) => {
      const a = $(el);
      const id = idOf(a.attr('href'), 'chapters');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = cleanText(a.find('div.font-bold:not(.flex)').first().text());
      const sub = cleanText(a.find('.text-gray-500').first().text());
      const m = /(\d+(?:\.\d+)?)\s*$/.exec(title);
      const num = m ? m[1] : null;
      const name = (num ? `Chapter ${num}` : title || id) + (sub ? `: ${sub}` : '');
      rows.push({ id, chapterId: id, name, number: num ? parseFloat(num) : 0 });
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
    const $ = cheerio.load(await this._html(pathOf('chapters', chapterId)));
    const pages = [];
    $('picture img, .image-container img').each((_, el) => {
      const src = absolute($(el).attr('src'));
      if (src) pages.push(src);
    });
    if (pages.length === 0) throw new Error('TCB Scans returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async _html(path) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({ url: SITE_BASE + path, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`TCB Scans HTTP ${response.status} for ${path}`);
    return response.data;
  }
}

module.exports = { Source };
