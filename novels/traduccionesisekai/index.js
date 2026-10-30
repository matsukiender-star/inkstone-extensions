const SITE = 'https://traduccionesisekai.blogspot.com';

const NOVELS = [
  { mangaId: 'rezero-kara-hajimeru-isekai-seikatsu', title: 'Re:Zero Kara Hajimeru Isekai Seikatsu (Web Novel)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhKCuxVJ_Iu5ZgmJdo44W072YnaD9bdO1yU3tF2GvBBYMELOP21HScK4-J5N_ws_9BHLNONgg1mGvwBKwG8Nlf3KWh6n_rwM1wM4msGgSf8i6oC33blEr1Dx8kvkuCI_dnVqwuxJebjqu98sLvVzrXV-iPVqddQOECLk8JU22CBuyYSsVYS29d9wFn24Aw/s16000/rezero.png', medium: 'novel' },
  { mangaId: 'extras-y-e', title: 'Extras y especiales de Re:Zero', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi8SDj-QPWM1pQ9eFO76XhLSWOxyeqyzF1W9XYlIZtuKdpjYKc7EFf5Qt6ppwpIaSIqGTBVfF1rQDuge99-I2o3EdW5xB8bYTLmkuTJ7b5GVbt2d-Bdc9irG37vgvLEzZUcuFQuYao91Ng/s1600/Cool.jpg', medium: 'novel' },
  { mangaId: 'classroom-of-elite', title: 'Classroom of the Elite', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjsWBI-kx4s89ePG9tY3eiFLXMxjfnepG4qkDweNCKmSftVAuouibLCr3p9Cx8DDXNZzVoCEL9PWFZFfgVbECiQtf4XQJ05soyOIvN8a0hYUVNZhe6yoj7TAyqWyd3VyS8Fx0dhqJHO9gk/s1600/1217321-0-q80.jpg', medium: 'novel' },
];

function chapterPath(href) {
  const match = /traduccionesisekai\.blogspot\.[a-z.]+\/((?:\d{4}\/\d{2}|p)\/[^?#"]+\.html)/.exec(href || '');
  return match ? match[1] : null;
}

function dateOf(path) {
  const match = /^(\d{4})\/(\d{2})\//.exec(path);
  return match ? Date.UTC(+match[1], +match[2] - 1, 1) : undefined;
}

function pageUrl(mangaId) {
  return `${SITE}/p/${mangaId}.html`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [{ id: 'novels', name: 'Novels' }];
  }

  async getSearchResults(request) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim().toLowerCase();
    return { results: NOVELS.filter((novel) => !query || novel.title.toLowerCase().includes(query)) };
  }

  async getMangaDetails(mangaId) {
    const novel = NOVELS.find((item) => item.mangaId === mangaId);
    if (!novel) throw new Error('Traducciones Isekai: unknown novel');
    return {
      mangaInfo: {
        title: novel.title,
        image: novel.image,
        desc: 'Traducción al español de Traducciones Isekai.',
        status: 'ONGOING',
        tags: [],
        webURL: pageUrl(mangaId),
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(pageUrl(mangaId)));
    const chapters = [];
    const seen = new Set();
    $('.post-body a[href]').each((i, el) => {
      const chapterId = chapterPath($(el).attr('href'));
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!chapterId || !name || seen.has(chapterId)) return;
      seen.add(chapterId);
      chapters.push({ id: chapterId, chapterId, name, time: dateOf(chapterId) });
    });
    return chapters.map((chapter, i) => ({ ...chapter, number: i + 1 })).reverse();
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/${chapterId}`));
    const body = $('.post-body').first();
    body.find('script, style, noscript, img, table.tr-caption-container, ins').remove();
    body.find('br').replaceWith('\n');
    body.find('p, div, h1, h2, h3, h4, li, blockquote').append('\n');
    const paragraphs = body
      .text()
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line && !/^(anterior|siguiente|índice)(\s*\/\/\s*(anterior|siguiente|índice))*$/i.test(line));
    if (!paragraphs.length) throw new Error('Traducciones Isekai: the chapter has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Traducciones Isekai: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
