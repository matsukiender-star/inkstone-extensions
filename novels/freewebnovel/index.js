const SITE_BASE = 'https://freewebnovel.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CHAPTER_PAGE_SIZE = 200;
const MAX_CHAPTER_PAGES = 60;
const PARALLEL_PAGES = 10;
const CHAPTER_LIST_KEEP_MS = 60 * 1000;
const SCRIPT_BURST = 12;
const SCRIPT_TIMEOUT_MS = 170000;

let jsonComesWrapped = false;

function parseJsonBody(text) {
  const body = String(text || '').trim();
  if (body.charAt(0) !== '<') return JSON.parse(body);
  jsonComesWrapped = true;
  const $ = cheerio.load(body);
  const pre = $('pre').first();
  return JSON.parse((pre.length ? pre.text() : $('body').text()).trim());
}

function chapterScript(basePath, startPage, totalPage) {
  return `
(function () {
  var base = ${JSON.stringify(basePath)};
  var MAX_PAGES = ${MAX_CHAPTER_PAGES};
  var BURST = ${SCRIPT_BURST};
  var start = ${startPage};
  var knownTotal = ${totalPage};
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function parse(n, text) {
    var json = JSON.parse(text);
    if (!json || json.code !== 200 || typeof json.html !== 'string') throw new Error('chapter page ' + n + ' had an unexpected reply');
    var doc = new DOMParser().parseFromString('<ul>' + json.html + '</ul>', 'text/html');
    var rows = [];
    [].forEach.call(doc.querySelectorAll('li a'), function (a) {
      var id = (a.getAttribute('href') || '').split('/').filter(Boolean).pop();
      if (id) rows.push([id, (a.getAttribute('title') || a.textContent || '')]);
    });
    if (json.html.trim() && rows.length === 0) throw new Error('chapter page ' + n + ' had markup with no chapter rows');
    return { rows: rows, totalPage: parseInt(json.totalPage, 10) || 1, totalChapters: parseInt(json.totalChapters, 10) || 0 };
  }
  function load(n, attempt) {
    return fetch(base + n, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } }).then(function (r) {
      if (r.status === 429 && attempt < 8) return sleep(1500 * (attempt + 1)).then(function () { return load(n, attempt + 1); });
      if (!r.ok) throw new Error('chapter page ' + n + ' answered HTTP ' + r.status);
      return r.text().then(function (text) { return parse(n, text); });
    });
  }
  var pages = {};
  var total = knownTotal;
  var expected = 0;
  (knownTotal ? Promise.resolve() : load(1, 0).then(function (first) { pages[1] = first.rows; total = first.totalPage; expected = first.totalChapters; start = 2; }))
    .then(function () {
      var last = Math.min(total, MAX_PAGES);
      var wanted = [];
      for (var n = start; n <= last; n += 1) wanted.push(n);
      var together = wanted.slice(0, BURST);
      var later = wanted.slice(BURST);
      return Promise.all(together.map(function (n) { return load(n, 0).then(function (p) { pages[n] = p.rows; }); })).then(function () {
        return later.reduce(function (chain, n) {
          return chain.then(function () { return sleep(1000); }).then(function () { return load(n, 0).then(function (p) { pages[n] = p.rows; }); });
        }, Promise.resolve());
      }).then(function () { return last; });
    })
    .then(function (last) {
      var ordered = [];
      for (var n = 1; n <= last; n += 1) if (pages[n]) ordered.push(pages[n]);
      __reportResult({ pages: ordered, totalPage: total, totalChapters: expected });
    })
    .catch(function (e) { __reportError(String((e && e.message) || e)); });
})();
`;
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absUrl(maybeRelative) {
  if (!maybeRelative) return undefined;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${SITE_BASE}${maybeRelative.indexOf('/') === 0 ? '' : '/'}${maybeRelative}`;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

const STYLED_LETTER = /[\u{1D400}-\u{1D7FF}\u{2100}-\u{214F}\u{FF21}-\u{FF5A}\u{24B6}-\u{24E9}\u{1F130}-\u{1F189}]/u;
const SITE_MARK = /free\s*web\s*novel(?:\s*\.\s*com)?/gi;

function stripSiteMark(text) {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!STYLED_LETTER.test(token)) return token;
      const original = Array.from(token);
      const plain = Array.from(token.normalize('NFKC'));
      if (original.length !== plain.length) return token;
      const flat = plain.join('');
      const found = [];
      let match;
      SITE_MARK.lastIndex = 0;
      while ((match = SITE_MARK.exec(flat))) {
        found.push({ from: Array.from(flat.slice(0, match.index)).length, length: Array.from(match[0]).length });
      }
      for (let i = found.length - 1; i >= 0; i -= 1) original.splice(found[i].from, found[i].length);
      return original.join('');
    })
    .join('');
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style, h4').remove();
  clone.find('br').replaceWith('\n');

  let text = '';
  clone.contents().each((_, node) => {
    if (node.type === 'text') {
      text += node.data;
    } else {
      const inner = $(node).text();
      text += inner.trim() ? `${inner}\n\n` : '\n';
    }
  });

  return stripSiteMark(text)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasNextPage($) {
  let hasNext = false;
  $('.pages a').each((_, a) => {
    const $a = $(a);
    if (!hasNext && $a.text().trim() === '>>') {
      const href = $a.attr('href') || '';
      if (href.indexOf('javascript:') !== 0) hasNext = true;
    }
  });
  return hasNext;
}

function mapListRow($, el) {
  const $row = $(el);
  const linkEl = $row.find('.txt h3.tit a').first();
  const href = linkEl.attr('href') || '';
  const mangaId = href.replace(/^\/novel\//, '').replace(/\/$/, '');
  if (!mangaId) return null;

  const manga = {
    mangaId,
    title: cleanText(linkEl.text()) || cleanText(linkEl.attr('title')) || mangaId,
    image: absUrl($row.find('.pic img').first().attr('src')),
    webURL: absUrl(href),
    medium: 'novel',
  };

  const ratingText = $row.find('.core span').first().text().trim();
  const rating = parseFloat(ratingText);
  if (!isNaN(rating) && rating > 0) manga.rating = rating;

  $row.find('.desc .item').each((_, itemEl) => {
    const $item = $(itemEl);
    const iconClass = $item.find('span').first().attr('class') || '';
    if (iconClass.indexOf('glyphicon-th-list') !== -1) {
      const tags = [];
      $item.find('.right a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });
      if (tags.length) manga.tags = tags;
    } else if (iconClass.indexOf('glyphicon-book') !== -1) {
      const chapterCount = parseInt($item.find('.right .s1').first().text(), 10);
      if (!isNaN(chapterCount)) manga.chapters = chapterCount;
    }
  });

  return manga;
}

function parseListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.li-row').each((_, el) => {
    const manga = mapListRow($, el);
    if (manga) results.push(manga);
  });
  return { $, results };
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest-novel', name: 'Latest Novels' },
      { id: 'latest-release', name: 'Latest Release' },
      { id: 'most-popular', name: 'Most Popular' },
      { id: 'completed-novel', name: 'Completed Novels' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/home`);
      const $ = cheerio.load(html);
      const seen = new Map();
      $('dl.d2 a').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const m = href.match(/^\/genre\/(.+)$/);
        if (!m) return;
        const id = m[1];
        const label = cleanText($a.text());
        if (id && label && !seen.has(id)) seen.set(id, label);
      });
      return Array.from(seen, ([id, label]) => ({ id, label }));
    } catch (e) {
      console.error('FreeWebNovel getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    try {
      if (query) {
        const url =
          page > 1
            ? `${SITE_BASE}/search?keyword=${encodeURIComponent(query)}&page=${page}`
            : `${SITE_BASE}/search?keyword=${encodeURIComponent(query)}`;
        const html = await this.requestHTML(url);
        const { $, results } = parseListing(html);
        return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
      }

      const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
      if (tagIds.length > 0) {
        const base = `/genre/${tagIds[0]}`;
        const url = page > 1 ? `${SITE_BASE}${base}/${page}` : `${SITE_BASE}${base}`;
        const html = await this.requestHTML(url);
        const { $, results } = parseListing(html);
        return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
      }

      const feed = (request && request.feed) || 'latest-release';
      const base = `/sort/${feed}`;
      const url = page > 1 ? `${SITE_BASE}${base}/${page}` : `${SITE_BASE}${base}`;
      const html = await this.requestHTML(url);
      const { $, results } = parseListing(html);
      return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('FreeWebNovel getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const meta = (prop) => $(`meta[property="og:novel:${prop}"]`).attr('content');
    const title = cleanText(meta('novel_name')) || cleanText($('h1.tit').first().text()) || mangaId;
    const status = mapStatus(meta('status'));

    const mangaInfo = {
      title,
      image: absUrl($('meta[property="og:image"]').attr('content')),
      desc: blockText($, $('.m-desc .txt .inner').first()) || cleanText($('meta[name="description"]').attr('content')),
      status,
      webURL: url,
      medium: 'novel',
      completed: status === 'COMPLETED',
    };

    const author = cleanText(meta('author'));
    if (author) mangaInfo.author = author;

    const genreStr = meta('genre');
    if (genreStr) {
      mangaInfo.tags = genreStr
        .split(',')
        .map((g) => cleanText(g))
        .filter(Boolean);
    }

    const latestName = meta('lastest_chapter_name') || '';
    const chapterMatch = latestName.match(/(\d+)/);
    if (chapterMatch) mangaInfo.chapters = parseInt(chapterMatch[1], 10);

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const kept = this.chapterLists && this.chapterLists.get(mangaId);
    if (kept && Date.now() - kept.at < CHAPTER_LIST_KEEP_MS) return kept.promise;
    const promise = this.loadChapters(mangaId);
    if (!this.chapterLists) this.chapterLists = new Map();
    this.chapterLists.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => {
      const current = this.chapterLists.get(mangaId);
      if (current && current.promise === promise) this.chapterLists.delete(mangaId);
    });
    return promise;
  }

  async loadChapters(mangaId) {
    try {
      let first = null;
      let totalPage = 0;
      if (!jsonComesWrapped) {
        const json = await this.fetchChapterPage(mangaId, 1);
        first = this.chapterRows(json, mangaId, 1);
        totalPage = parseInt(json.totalPage, 10) || 1;
      }

      let pages = null;
      if (jsonComesWrapped && !(first && totalPage <= 1)) {
        try {
          const got = await this.chapterPagesByScript(mangaId, first ? 2 : 1, first ? totalPage : 0);
          pages = first ? [first, ...got.pages] : got.pages;
          totalPage = got.totalPage;
        } catch (e) {
          console.error('FreeWebNovel: the in-page chapter fetch failed, using one request per page:', e);
        }
      }
      if (!pages) {
        if (!first) {
          const json = await this.fetchChapterPage(mangaId, 1);
          first = this.chapterRows(json, mangaId, 1);
          totalPage = parseInt(json.totalPage, 10) || 1;
        }
        pages = await this.chapterPagesPlain(mangaId, first, totalPage);
      }

      const chapters = [];
      for (const rows of pages) {
        if (rows.length === 0) break;
        for (const [chapterId, rowName] of rows) {
          const numMatch = chapterId.match(/chapter-(\d+(?:\.\d+)?)/i);
          const number = numMatch ? parseFloat(numMatch[1]) : 0;
          chapters.push({ id: chapterId, chapterId, name: rowName || `Chapter ${number}`, number });
        }
      }

      if (totalPage > MAX_CHAPTER_PAGES) {
        console.warn(
          `FreeWebNovel: ${mangaId} reports ${totalPage} chapter pages but the fetch is capped at ` +
            `${MAX_CHAPTER_PAGES}, about ${(totalPage - MAX_CHAPTER_PAGES) * CHAPTER_PAGE_SIZE} chapters not listed`
        );
      }

      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('FreeWebNovel getChapters failed:', e);
      throw e;
    }
  }

  async chapterPagesPlain(mangaId, first, totalPage) {
    const lastPage = Math.min(totalPage, MAX_CHAPTER_PAGES);
    const pages = [first];
    const together = [];
    for (let page = 2; page <= Math.min(lastPage, PARALLEL_PAGES); page += 1) together.push(page);
    if (together.length > 0) {
      const jsons = await Promise.all(together.map((page) => this.fetchChapterPage(mangaId, page)));
      jsons.forEach((json, index) => pages.push(this.chapterRows(json, mangaId, together[index])));
    }
    for (let page = PARALLEL_PAGES + 1; page <= lastPage; page += 1) {
      pages.push(this.chapterRows(await this.fetchChapterPage(mangaId, page), mangaId, page));
    }
    return pages;
  }

  async chapterPagesByScript(mangaId, start, total) {
    const path = `/novel/${encodeURIComponent(mangaId)}?ajax=chapters&pageSize=${CHAPTER_PAGE_SIZE}&page=`;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}${path}1`,
      baseUrl: `${SITE_BASE}/`,
      script: chapterScript(path, start, total),
      timeoutMs: SCRIPT_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if (!result || 'error' in result) {
      throw new Error(`FreeWebNovel chapter script failed: ${result && result.error}`);
    }
    const value = result.value;
    if (!value || !Array.isArray(value.pages) || (start === 1 && value.pages.length === 0)) {
      throw new Error('FreeWebNovel chapter script returned no pages');
    }
    return {
      pages: value.pages.map((rows) =>
        rows.map((row) => [String(row[0]), cleanText(String(row[1] || ''))])
      ),
      totalPage: parseInt(value.totalPage, 10) || 1,
    };
  }

  chapterRows(json, mangaId, page) {
    if (!json.html.trim()) return [];
    const $ = cheerio.load(json.html);
    const rows = [];
    $('li').each((_, li) => {
      const a = $(li).find('a').first();
      const href = a.attr('href') || '';
      const chapterId = href.split('/').filter(Boolean).pop();
      if (!chapterId) return;
      rows.push([chapterId, cleanText(a.attr('title')) || cleanText(a.text())]);
    });
    if (rows.length === 0) {
      throw new Error(
        `FreeWebNovel: chapter page ${page} of ${mangaId} returned ${json.html.length} bytes ` +
          'of markup with no parseable chapter rows'
      );
    }
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const text = blockText($, $('#article').first());
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('FreeWebNovel getChapterDetails failed:', e);
      throw e;
    }
  }

  async fetchChapterPage(mangaId, page) {
    const url = `${SITE_BASE}/novel/${encodeURIComponent(
      mangaId
    )}?ajax=chapters&page=${page}&pageSize=${CHAPTER_PAGE_SIZE}`;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let json = null;
      try {
        json = await this.requestJSON(url);
      } catch (e) {
        lastError = e;
        console.error(`FreeWebNovel chapter page ${page} request failed (attempt ${attempt}):`, e);
        continue;
      }
      if (json && json.code === 200 && typeof json.html === 'string') return json;
      lastError = new Error(
        `unexpected response envelope (code ${json && json.code}, html is ${typeof (json && json.html)})`
      );
      console.error(`FreeWebNovel chapter page ${page} unreadable (attempt ${attempt}):`, lastError);
    }

    throw new Error(
      `FreeWebNovel: chapter page ${page} of ${mangaId} still unreadable after 3 attempts: ${
        lastError && lastError.message
      }`
    );
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`FreeWebNovel HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`FreeWebNovel API HTTP ${response.status}`);
    }
    return parseJsonBody(response.data);
  }
}

module.exports = { Source };
