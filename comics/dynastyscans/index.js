const SITE_BASE = 'https://dynasty-scans.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const INDEX_KEY = 'cover-index-v1';
const INDEX_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const COVER_PREFIX = '/system/tag_contents_covers/';

const KINDS = {
  series: { path: 'series', prefix: '', klass: 'Series', label: 'Series' },
  anthologies: { path: 'anthologies', prefix: 'anthologies~', klass: 'Anthology', label: 'Anthologies' },
  doujins: { path: 'doujins', prefix: 'doujins~', klass: 'Doujin', label: 'Doujins' },
  issues: { path: 'issues', prefix: 'issues~', klass: 'Issue', label: 'Issues' },
};

const SORTS = { best: '', name: 'name', added: 'created_at', released: 'released_on' };

const EXPLICIT_TAG = /nsfw|\bsex\b|rape|futanari/i;
const SUGGESTIVE_TAG = /^(ecchi|mature|violence)$/i;

function splitId(id) {
  const text = String(id || '');
  const at = text.indexOf('~');
  if (at < 0) return { kind: KINDS.series, permalink: text };
  const name = text.slice(0, at + 1);
  const kind = Object.keys(KINDS)
    .map((k) => KINDS[k])
    .find((k) => k.prefix === name);
  return { kind: kind || KINDS.series, permalink: text.slice(at + 1) };
}

function absolute(path) {
  if (!path) return undefined;
  return /^https?:/i.test(path) ? path : SITE_BASE + path;
}

function htmlToText(html) {
  if (!html) return undefined;
  const $ = cheerio.load('<div id="root">' + html + '</div>');
  $('br').replaceWith('\n');
  const parts = [];
  $('#root')
    .children()
    .each((_, el) => {
      const text = $(el).text().trim();
      if (text) parts.push(text);
    });
  const text = parts.length > 0 ? parts.join('\n\n') : $('#root').text().trim();
  return text || undefined;
}

function mapStatus(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('ongoing')) return 'ONGOING';
  if (text.includes('complete')) return 'COMPLETED';
  if (text.includes('hiatus')) return 'HIATUS';
  if (text.includes('dropped') || text.includes('cancel')) return 'CANCELLED';
  return 'UNKNOWN';
}

function ageRatingOf(tagNames) {
  if (tagNames.some((n) => EXPLICIT_TAG.test(n))) return 18;
  if (tagNames.some((n) => SUGGESTIVE_TAG.test(n))) return 16;
  return undefined;
}

function chapterNumberOf(title) {
  const m = /^\s*(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i.exec(String(title || ''));
  return m ? parseFloat(m[1]) : undefined;
}

function volumeOf(header) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(header || ''));
  return m ? m[1] : undefined;
}

function parseCoverGrid(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('ul.cover-list li a.thumbnail').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = /^\/([a-z]+)\/([^/?#]+)$/.exec(href);
    if (!m) return;
    const title = $(el).find('.caption b').first().text().trim() || $(el).find('.caption').text().trim();
    const src = $(el).find('img').first().attr('src') || '';
    items.push({
      permalink: decodeURIComponent(m[2]),
      title,
      cover: src.indexOf('cover_missing') >= 0 ? undefined : src,
    });
  });
  const lastPage = Math.max(
    1,
    ...$('.pagination a')
      .map((_, a) => parseInt((/[?&]page=(\d+)/.exec($(a).attr('href') || '') || [])[1], 10) || 1)
      .get(),
  );
  const hasNext = $('.pagination a[rel="next"]').length > 0;
  return { items, lastPage, hasNext };
}

function parseSearch(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('dl.chapter-list dd').each((_, dd) => {
    const a = $(dd).find('a.name').first();
    const m = /^\/([a-z]+)\/([^/?#]+)$/.exec(a.attr('href') || '');
    if (!m) return;
    items.push({
      kindPath: m[1],
      permalink: decodeURIComponent(m[2]),
      title: a.text().trim(),
      author: $(dd).find('a[href^="/authors/"]').first().text().trim() || undefined,
      tags: $(dd)
        .find('.tags a.label')
        .map((_, t) => $(t).text().trim())
        .get(),
    });
  });
  return { items, hasNext: $('.pagination a[rel="next"]').length > 0 };
}

class Source {
  constructor() {
    this._manager = null;
    this._index = null;
    this._indexLoading = null;
    this._tags = null;
    this._tagIds = new Map();
    this._details = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'series', name: 'All Series' },
      { id: 'anthologies', name: 'Anthologies' },
      { id: 'doujins', name: 'Doujins' },
      { id: 'issues', name: 'Magazine Issues' },
    ];
  }

  async getSortOptions() {
    return [
      { id: 'best', label: 'Best Match' },
      { id: 'name', label: 'Alphabetical' },
      { id: 'added', label: 'Date Added' },
      { id: 'released', label: 'Release Date' },
    ];
  }

  async getSearchTags() {
    try {
      if (!this._tags) {
        const first = await this._json('/tags.json?page=1');
        const total = typeof first.total_pages === 'number' ? first.total_pages : 1;
        const pages = [first];
        for (let p = 2; p <= total; p++) pages.push(await this._json(`/tags.json?page=${p}`));
        const tags = [];
        pages.forEach((page) =>
          (page.tags || []).forEach((group) =>
            Object.keys(group).forEach((letter) =>
              (group[letter] || []).forEach((t) => {
                if (t && t.permalink && t.name) tags.push({ id: t.permalink, label: t.name });
              }),
            ),
          ),
        );
        this._tags = tags.sort((a, b) => a.label.localeCompare(b.label));
      }
      return this._tags;
    } catch (e) {
      console.error('Dynasty Scans getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const title = ((request && request.title) || '').trim();
    const feed = (request && request.feed) || 'latest';
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const included = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const excluded = ((request && request.excludedTags) || []).filter((t) => t && t.id);

    if (title || included.length > 0 || excluded.length > 0) {
      return this._search(title, feed, request && request.sortId, included, excluded, page);
    }
    if (feed === 'latest') return this._latest(page);
    return this._grid(KINDS[feed] || KINDS.series, page);
  }

  async _grid(kind, page) {
    const html = await this._text(`/${kind.path}?view=cover&page=${page}`);
    const grid = parseCoverGrid(html);
    const results = grid.items.map((item) => ({
      mangaId: kind.prefix + item.permalink,
      title: item.title,
      image: absolute(item.cover),
      referer: SITE_BASE,
      medium: 'comics',
      webURL: `${SITE_BASE}/${kind.path}/${item.permalink}`,
    }));
    return { results, metadata: grid.hasNext && results.length > 0 ? { page: page + 1 } : undefined };
  }

  async _latest(page) {
    const index = await this._coverIndex();
    let current = page;
    for (let tries = 0; tries < 4; tries++, current++) {
      const json = await this._json(`/chapters/added.json?page=${current}`);
      const chapters = Array.isArray(json.chapters) ? json.chapters : [];
      const totalPages = typeof json.total_pages === 'number' ? json.total_pages : current;
      const seen = new Set();
      const results = [];
      chapters.forEach((chapter) => {
        const tag = (chapter.tags || []).find((t) => t && t.type === 'Series');
        if (!tag || seen.has(tag.permalink)) return;
        seen.add(tag.permalink);
        const known = index.get(tag.permalink);
        results.push({
          mangaId: tag.permalink,
          title: tag.name,
          image: known ? absolute(known.cover) : undefined,
          referer: SITE_BASE,
          medium: 'comics',
          webURL: `${SITE_BASE}/series/${tag.permalink}`,
        });
      });
      const more = chapters.length > 0 && current < totalPages ? { page: current + 1 } : undefined;
      if (results.length > 0 || !more) return { results, metadata: more };
    }
    return { results: [], metadata: undefined };
  }

  async _search(title, feed, sortId, included, excluded, page) {
    const kind = KINDS[feed] || KINDS.series;
    const withIds = [];
    const withoutIds = [];
    for (const tag of included) {
      const id = await this._tagId(tag);
      if (id) withIds.push(id);
    }
    for (const tag of excluded) {
      const id = await this._tagId(tag);
      if (id) withoutIds.push(id);
    }
    const parts = [`q=${encodeURIComponent(title)}`, `classes[]=${kind.klass}`];
    withIds.forEach((id) => parts.push(`with[]=${id}`));
    withoutIds.forEach((id) => parts.push(`without[]=${id}`));
    const sort = SORTS[sortId];
    if (sort) parts.push(`sort=${sort}`);
    if (page > 1) parts.push(`page=${page}`);
    const found = parseSearch(await this._text(`/search?${parts.join('&')}`));
    const index = kind === KINDS.series ? await this._coverIndex() : new Map();
    const results = found.items.map((item) => {
      const known = index.get(item.permalink);
      return {
        mangaId: kind.prefix + item.permalink,
        title: item.title,
        image: known ? absolute(known.cover) : undefined,
        referer: SITE_BASE,
        author: item.author,
        medium: 'comics',
        webURL: `${SITE_BASE}/${kind.path}/${item.permalink}`,
      };
    });
    return { results, metadata: found.hasNext && results.length > 0 ? { page: page + 1 } : undefined };
  }

  async _tagId(tag) {
    const key = tag.id;
    if (this._tagIds.has(key)) return this._tagIds.get(key);
    const name = tag.label || tag.id;
    const list = await this._json('/tags/suggest', { method: 'POST', form: `query=${encodeURIComponent(name)}` });
    const wanted = String(name).toLowerCase();
    const hit = (Array.isArray(list) ? list : []).find(
      (t) => t && t.type === 'General' && String(t.name).toLowerCase() === wanted,
    );
    const id = hit ? hit.id : null;
    this._tagIds.set(key, id);
    return id;
  }

  async _coverIndex() {
    if (this._index) return this._index;
    if (this._indexLoading) return this._indexLoading;
    this._indexLoading = this._loadIndex().then(
      (index) => {
        this._indexLoading = null;
        this._index = index;
        return index;
      },
      () => {
        this._indexLoading = null;
        return new Map();
      },
    );
    return this._indexLoading;
  }

  async _loadIndex() {
    const state = App.createSourceStateManager();
    let saved = null;
    try {
      saved = await state.retrieve(INDEX_KEY);
    } catch (e) {
      saved = null;
    }
    const fromRows = (rows) => {
      const map = new Map();
      rows.forEach((r) => map.set(r[0], { title: r[1], cover: r[2] ? COVER_PREFIX + r[2] : undefined }));
      return map;
    };
    const savedRows = saved && Array.isArray(saved.rows) ? saved.rows : null;
    if (savedRows && typeof saved.at === 'number' && Date.now() - saved.at < INDEX_MAX_AGE_MS) {
      return fromRows(savedRows);
    }
    try {
      const rows = [];
      const first = parseCoverGrid(await this._text('/series?view=cover&page=1'));
      const add = (items) =>
        items.forEach((i) => {
          const cover = i.cover && i.cover.indexOf(COVER_PREFIX) === 0 ? i.cover.slice(COVER_PREFIX.length) : '';
          rows.push([i.permalink, i.title, cover]);
        });
      add(first.items);
      for (let p = 2; p <= first.lastPage; p++) {
        add(parseCoverGrid(await this._text(`/series?view=cover&page=${p}`)).items);
      }
      if (rows.length < 100) throw new Error('cover grid came back almost empty');
      try {
        await state.store(INDEX_KEY, { at: Date.now(), rows });
      } catch (e) {
      }
      return fromRows(rows);
    } catch (e) {
      if (savedRows) return fromRows(savedRows);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const { kind, permalink } = splitId(mangaId);
    const data = await this._detail(mangaId);
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const named = (type) => tags.filter((t) => t && t.type === type && t.name).map((t) => t.name);
    const general = named('General');
    const status = named('Status')[0];
    const author = [...new Set(named('Author'))].join(' / ') || undefined;
    const rows = (data.taggings || []).filter((t) => t && t.permalink);
    const info = {
      mangaId: kind.prefix + permalink,
      title: data.name || permalink,
      image: absolute(data.cover),
      referer: SITE_BASE,
      desc: htmlToText(data.description),
      author,
      tags: [...new Set([...general, ...named('Doujin')])],
      status: mapStatus(status),
      completed: mapStatus(status) === 'COMPLETED',
      chapters: rows.length,
      medium: 'comics',
      webURL: `${SITE_BASE}/${kind.path}/${permalink}`,
    };
    const rating = ageRatingOf(general);
    if (rating) info.ageRating = rating;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this._detail(mangaId);
    const chapters = [];
    const entries = (data.taggings || []).filter((e) => e && e.permalink);
    const numbered = entries.some((e) => chapterNumberOf(e.title) !== undefined);
    let position = 0;
    let volume;
    let last = 0;
    let loose = 0;
    (data.taggings || []).forEach((entry) => {
      if (!entry) return;
      if (typeof entry.header === 'string' || (entry.header === null && !entry.permalink)) {
        volume = volumeOf(entry.header);
        return;
      }
      if (!entry.permalink) return;
      const title = typeof entry.title === 'string' && entry.title ? entry.title : entry.permalink;
      position += 1;
      let number = chapterNumberOf(title);
      if (!numbered) {
        number = position;
      } else if (number === undefined) {
        loose += 1;
        number = Math.round((last + 0.01 * loose) * 100) / 100;
      } else {
        last = number;
        loose = 0;
      }
      const scanlators = (entry.tags || []).filter((t) => t && t.type === 'Scanlator' && t.name).map((t) => t.name);
      const chapter = {
        id: entry.permalink,
        chapterId: entry.permalink,
        name: title,
        number,
        time: entry.released_on ? Date.parse(entry.released_on) || undefined : undefined,
      };
      if (scanlators.length > 0) chapter.group = scanlators.join(' & ');
      if (volume) chapter.volume = volume;
      chapters.push(chapter);
    });
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._json(`/chapters/${encodeURIComponent(chapterId)}.json`);
    const pages = (Array.isArray(json.pages) ? json.pages : [])
      .map((p) => absolute(p && p.url))
      .filter((u) => typeof u === 'string' && u);
    if (pages.length === 0) throw new Error('Dynasty Scans returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE };
  }

  async _detail(mangaId) {
    const { kind, permalink } = splitId(mangaId);
    const key = kind.prefix + permalink;
    const hit = this._details.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this._json(`/${kind.path}/${encodeURIComponent(permalink)}.json`);
    this._details.set(key, { at: Date.now(), promise });
    promise.catch(() => this._details.delete(key));
    return promise;
  }

  _requests() {
    if (!this._manager) {
      this._manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    }
    return this._manager;
  }

  async _fetch(path, options) {
    const opts = options || {};
    const headers = { 'User-Agent': UA };
    if (opts.json) headers.Accept = 'application/json';
    if (opts.form !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      const request = App.createRequest({
        url: SITE_BASE + path,
        method: opts.method || 'GET',
        headers,
        body: opts.form,
      });
      response = await this._requests().schedule(request);
      if (response.status !== 503) break;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Dynasty Scans HTTP ${response.status} for ${path}`);
    }
    return response.data;
  }

  async _json(path, options) {
    return JSON.parse(await this._fetch(path, { ...(options || {}), json: true }));
  }

  async _text(path) {
    return this._fetch(path);
  }
}

module.exports = { Source };
