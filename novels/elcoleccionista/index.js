const API = 'https://public-api.wordpress.com/rest/v1.1/sites/elcoleccionistadenovelas.wordpress.com';

const PAGE_SIZE = 20;
const POST_CACHE_MS = 5 * 60 * 1000;
const POST_FIELDS = 'ID,title,URL,content,featured_image,categories';

function plain(html) {
  return cheerio.load(`<div>${html || ''}</div>`)('div').first().text().trim();
}

function driveIdOf(href) {
  const match = /drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:export=download&(?:amp;)?)?id=)([\w-]{20,})/.exec(href || '');
  return match ? match[1] : null;
}

function isAdult(post) {
  return Object.keys(post.categories || {}).some((name) => /\+18|er[oó]tic/i.test(name));
}

function coverOf(post) {
  if (post.featured_image) return post.featured_image;
  const $ = cheerio.load(post.content || '');
  return $('img[src]').first().attr('src') || undefined;
}

function partialOf(post) {
  const title = { mangaId: String(post.ID), title: plain(post.title), image: coverOf(post), webURL: post.URL, medium: 'novel' };
  if (isAdult(post)) title.ageRating = 18;
  return title;
}

const FIELDS = [
  ['author', /^(autor|autor\(a\)|escritor)$/i],
  ['genres', /^g[eé]neros?$/i],
  ['status', /^estado$/i],
  ['synopsis', /^(sinopsis|sipnosis|sin[oó]psis|resumen)$/i],
];

// The post lists its fields as "Label: value", and older posts put the colon or the value on the next line. Any other label ends the field before it. A post without a synopsis label gets its longest paragraph.
function fieldsOf(content) {
  const $ = cheerio.load(content || '');
  $('a[href*="drive.google.com"]').remove();
  $('br').replaceWith('\n');
  $('p, div, h1, h2, h3, h4, li, strong, b').append('\n');
  const lines = [];
  for (const raw of $.root().text().split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (line.startsWith(':') && lines.length) lines[lines.length - 1] += line;
    else lines.push(line);
  }
  const fields = { author: [], genres: [], status: [], synopsis: [], other: [] };
  let current = 'other';
  for (const line of lines) {
    const match = /^([^:]{2,40}?)\s*:\s*(.*)$/.exec(line);
    if (match) {
      const found = FIELDS.find(([, pattern]) => pattern.test(match[1].trim()));
      current = found ? found[0] : 'other';
      if (match[2]) fields[current].push(match[2]);
    } else {
      fields[current].push(line);
    }
  }
  if (!fields.synopsis.length) {
    const longest = fields.other.reduce((best, line) => (line.length > best.length ? line : best), '');
    if (longest.length >= 120) fields.synopsis.push(longest);
  }
  return fields;
}

function statusOf(text) {
  if (/activ|en curso|al d[ií]a|progreso|emisi[oó]n|public[aá]ndose/i.test(text)) return 'ONGOING';
  if (/complet|finaliz|terminad/i.test(text)) return 'COMPLETED';
  if (/pausa|abandon|cancel|hiatus/i.test(text)) return 'HIATUS';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.posts = new Map();
    this.categories = null;
  }

  getSourceFeeds() {
    return [{ id: 'latest', name: 'Latest' }];
  }

  async getSearchTags() {
    if (!this.categories) {
      this.categories = this.json(`${API}/categories?number=100&fields=slug,name,post_count`).then((reply) =>
        (reply.categories || [])
          .filter((category) => category.post_count >= 3)
          .map((category) => ({ id: category.slug, label: plain(category.name) })),
      );
      this.categories.catch(() => {
        this.categories = null;
      });
    }
    return this.categories;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tag = ((request && request.includedTags) || [])[0];
    const page = (metadata && metadata.page) || 1;
    let url = `${API}/posts/?number=${PAGE_SIZE}&page=${page}&order_by=date&fields=${POST_FIELDS}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    if (tag) url += `&category=${encodeURIComponent(tag.id)}`;
    const reply = await this.json(url);
    const posts = reply.posts || [];
    for (const post of posts) this.posts.set(String(post.ID), { at: Date.now(), promise: Promise.resolve(post) });
    return {
      results: posts.map(partialOf),
      metadata: page * PAGE_SIZE < (reply.found || 0) ? { page: page + 1 } : undefined,
    };
  }

  post(mangaId) {
    const cached = this.posts.get(mangaId);
    if (cached && Date.now() - cached.at < POST_CACHE_MS) return cached.promise;
    const promise = this.json(`${API}/posts/${encodeURIComponent(mangaId)}?fields=${POST_FIELDS}`);
    this.posts.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this.posts.delete(mangaId));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const post = await this.post(mangaId);
    const fields = fieldsOf(post.content);
    const genres = fields.genres
      .join(',')
      .split(/,|\s-\s/)
      .map((genre) => genre.replace(/\.$/, '').trim())
      .filter((genre) => genre && genre.length < 30);
    const mangaInfo = {
      ...partialOf(post),
      author: fields.author.join(' ').replace(/\.$/, '').trim() || undefined,
      desc: fields.synopsis.join('\n\n') || plain(post.title),
      status: statusOf(fields.status.join(' ')),
      tags: genres,
    };
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const post = await this.post(mangaId);
    const $ = cheerio.load(post.content || '');
    const chapters = [];
    const seen = new Set();
    $('a[href]').each((i, el) => {
      const file = driveIdOf($(el).attr('href'));
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!file || seen.has(file)) return;
      seen.add(file);
      chapters.push({ id: file, chapterId: file, name: name || `Archivo ${chapters.length + 1}` });
    });
    if (!chapters.length) throw new Error('El Coleccionista: the novel has no files');
    return chapters.map((chapter, i) => ({ ...chapter, number: i + 1 })).reverse();
  }

  async getChapterDetails(mangaId, chapterId) {
    return {
      id: chapterId,
      mangaId,
      pages: [],
      book: { url: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(chapterId)}&export=download&confirm=t` },
    };
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`El Coleccionista: HTTP ${response.status} from ${url}`);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
}

module.exports = { Source };
