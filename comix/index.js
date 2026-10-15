const SITE_BASE = 'https://comix.to';
const PAGE_SIZE = 24;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';

const MAX_CHAPTER_PAGES = 120;

const CHAPTER_WALK_BUDGET_MS = 45000;

const CHAPTER_PAGES_TTL_MS = 30 * 60 * 1000;

function extractInitialData(html) {
  const match = /<script[^>]*id="initial-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('Comix: no initial-data in page');
  return JSON.parse(match[1]);
}

function findQueryValue(initialData, ...needles) {
  const queries = (initialData && initialData.queries) || {};
  const key = Object.keys(queries).find((k) => needles.every((n) => k.includes(n)));
  return key ? queries[key] : undefined;
}

function itemsOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const v = value[keys[i]];
    if (Array.isArray(v) && (v.length === 0 || (v[0] && typeof v[0] === 'object'))) return v;
  }
  return [];
}

const ORACLE_PREAMBLE = `
  function __findQueryClient() {
    var el = document.getElementById('app-root') || document.body && document.body.firstElementChild;
    if (!el) return null;
    var key = null, keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactContainer$') === 0 || keys[i].indexOf('__reactFiber$') === 0) { key = keys[i]; break; }
    }
    if (!key) return null;
    var node = el[key], steps = 0;
    while (node && steps < 40000) {
      steps++;
      var props = node.memoizedProps;
      if (props && typeof props === 'object') {
        var pk = Object.keys(props);
        for (var j = 0; j < pk.length; j++) {
          var v = props[pk[j]];
          if (v && typeof v === 'object' && typeof v.getQueryCache === 'function') return v;
        }
      }
      var st = node.memoizedState;
      if (st && st.memoizedState && typeof st.memoizedState.getQueryCache === 'function') return st.memoizedState;
      if (node.child) { node = node.child; continue; }
      while (node && !node.sibling) node = node.return;
      node = node ? node.sibling : null;
    }
    return null;
  }

  /** Every settled cache entry whose serialised key contains all of needles. */
  function __matchingEntries(needles) {
    var qc = __findQueryClient();
    if (!qc) return [];
    return qc.getQueryCache().getAll().filter(function (q) {
      var key = JSON.stringify(q.queryKey);
      for (var i = 0; i < needles.length; i++) if (key.indexOf(needles[i]) === -1) return false;
      return q.state && q.state.data;
    }).map(function (q) { return { key: q.queryKey, data: q.state.data }; });
  }

  /** The list inside a response, whatever its property is called. */
  function __itemsOf(data) {
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (Array.isArray(v) && (v.length === 0 || (v[0] && typeof v[0] === 'object'))) return v;
    }
    return null;
  }

  /** The paging object next to the list: a plain meta, else the first object
   *  property that is not the list. */
  function __metaOf(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.meta && typeof data.meta === 'object') return data.meta;
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    }
    return null;
  }

  /** The total the site reports: the largest number in the paging object (it
   *  also holds the page, the page size and the last page, all smaller). */
  function __totalOf(data) {
    var meta = __metaOf(data);
    if (!meta) return 0;
    var total = 0;
    Object.keys(meta).forEach(function (k) {
      if (typeof meta[k] === 'number' && meta[k] > total) total = meta[k];
    });
    return total;
  }

  /** Whether a page after this one exists. seenCount is how many items the
   *  walk holds including this page and perPage the size of a full page (the
   *  query key says it: {page, limit}). A short page is the last one; after a
   *  full page the total decides, and the largest number in the paging object
   *  is the total then (it is at least the page size and the last page). */
  function __hasMore(data, seenCount, perPage) {
    var meta = __metaOf(data);
    if (meta && typeof meta.hasNext === 'boolean') return meta.hasNext;
    var items = __itemsOf(data) || [];
    if (items.length === 0 || items.length < perPage) return false;
    var total = __totalOf(data);
    return total > 0 ? seenCount < total : true;
  }

  /** The pages of a chapter, whatever the names: an object holding an https
   *  URL. The old shapes (a plain array, or { baseUrl, items }) still work. */
  function __pagesOf(d) {
    var pages = [];
    var raw = d && d.pages;
    if (raw && !Array.isArray(raw) && raw.items) {
      var prefix = raw.baseUrl || '';
      for (var j = 0; j < raw.items.length; j++) {
        var it = raw.items[j];
        pages.push({ url: prefix + it.url, scramble: it.s === 1 || it.scramble === true });
      }
      return pages;
    }
    var list = Array.isArray(raw) ? raw : null;
    if (!list) {
      var keys = Object.keys(d || {});
      for (var k = 0; k < keys.length && !list; k++) {
        var v = d[keys[k]];
        if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object') {
          var ok = false;
          var vals = Object.keys(v[0]);
          for (var m = 0; m < vals.length; m++) {
            if (typeof v[0][vals[m]] === 'string' && /^https?:\\/\\//.test(v[0][vals[m]])) ok = true;
          }
          if (ok) list = v;
        }
      }
    }
    if (!list) return pages;
    for (var n = 0; n < list.length; n++) {
      var p = list[n];
      if (!p || typeof p !== 'object') continue;
      var url = p.url;
      if (typeof url !== 'string') {
        var pk = Object.keys(p);
        url = null;
        for (var q = 0; q < pk.length; q++) {
          if (typeof p[pk[q]] === 'string' && /^https?:\\/\\//.test(p[pk[q]])) { url = p[pk[q]]; break; }
        }
      }
      if (url) pages.push({ url: url, scramble: p.s === 1 || p.scramble === true });
    }
    return pages;
  }

  /** Reports as soon as pick() returns something. pick() sees every matching
   *  cache entry and decides whether it has enough yet, which is how the
   *  chapter walk below accumulates pages across several refetches.
   *
   *  react-query publishes a cache event the moment it commits a decrypted
   *  response, so once its client is mounted an event pulls the pending
   *  attempt forward instead of waiting out the tick. The tick deliberately
   *  stays at 200ms once subscribed rather than relaxing: nothing here can
   *  tell whether the site's events actually cover the transition being
   *  waited on, and a longer backstop would make every one of the chapter
   *  walk's hops slower than the plain poll it replaced if they ever stop
   *  doing so. */
  function __pollFor(needles, timeoutMs, pick) {
    var deadline = Date.now() + timeoutMs;
    var done = false;
    var unsubscribe = null;
    var subscribed = false;
    var timer = null;

    function stop() {
      done = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (e) {}
        unsubscribe = null;
      }
    }

    function arm(delay) {
      if (done || timer !== null) return;
      timer = setTimeout(attempt, delay);
    }

    function attempt() {
      timer = null;
      if (done) return;
      var result;
      try {
        result = pick(__matchingEntries(needles));
      } catch (e) {
        stop();
        return __reportError('oracle failed: ' + (e && e.message ? e.message : String(e)));
      }
      if (result !== undefined && result !== null) {
        stop();
        return __reportResult(result);
      }
      if (Date.now() > deadline) {
        stop();
        return __reportError('oracle timed out waiting for ' + needles.join('+'));
      }
      if (!subscribed) {
        // Swallowed, not reported: failing to subscribe costs only the
        // acceleration, and this runs from a timer where an escaping throw
        // would strand the oracle with no result at all.
        try {
          var cache = __findQueryClient();
          cache = cache && cache.getQueryCache();
          if (cache && typeof cache.subscribe === 'function') {
            subscribed = true;
            unsubscribe = cache.subscribe(wake);
          }
        } catch (e) {}
      }
      arm(200);
    }

    /** Only pulls the pending attempt forward, never runs pick() inline: the
     *  chapter walk's pick() calls history.pushState, and react-query
     *  notifies subscribers from inside its own cache update, which is not a
     *  safe place to start another navigation and render from. Rescheduling
     *  the single pending timer rather than starting a second chain is what
     *  keeps a burst of cache events from forking the poll. */
    function wake() {
      if (done || timer === null) return;
      clearTimeout(timer);
      timer = null;
      arm(0);
    }

    attempt();
  }
`;

const RATING_WORDS = ['safe', 'suggestive', 'erotica', 'pornographic'];
const STATUS_WORDS = [
  'releasing', 'on_hiatus', 'finished', 'discontinued', 'not_yet_released', 'cancelled', 'hiatus', 'ongoing', 'completed',
];
const TYPE_WORDS = ['manga', 'manhwa', 'manhua', 'other', 'novel', 'webtoon', 'doujinshi', 'oneshot'];
const ALL_WORDS = [...RATING_WORDS, ...STATUS_WORDS, ...TYPE_WORDS];

const HID_RE = /^(?=.*[a-z])[a-z0-9]{4,5}$/;
const IMAGE_URL_RE = /^https?:\/\/.+\.(jpe?g|png|webp|gif)(\?.*)?$/i;

function isText(v) {
  return typeof v === 'string';
}

function isLabelNoise(v) {
  return (
    !v ||
    /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(v) ||
    /\bago$/.test(v) ||
    v === 'just now' ||
    /^(https?:|\/)/.test(v) ||
    /^[\d.?-]+$/.test(v)
  );
}

function unmangleManga(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (isText(raw.hid) && isText(raw.title)) return raw;

  const entries = Object.entries(raw);
  const out = {};
  entries.forEach(([, v]) => {
    if (!isText(v)) return;
    if (!out.contentRating && RATING_WORDS.includes(v)) out.contentRating = v;
    else if (!out.status && STATUS_WORDS.includes(v)) out.status = v;
    else if (!out.type && TYPE_WORDS.includes(v)) out.type = v;
  });

  let hidAt = -1;
  entries.forEach(([, v]) => {
    if (out.hid || !isText(v)) return;
    const fromUrl = /^\/title\/([a-z0-9]+)(?:-|$)/.exec(v);
    if (fromUrl) out.hid = fromUrl[1];
  });
  entries.forEach(([, v], i) => {
    if (hidAt !== -1 || !isText(v)) return;
    if (out.hid ? v === out.hid : HID_RE.test(v) && !ALL_WORDS.includes(v)) {
      hidAt = i;
      out.hid = v;
    }
  });
  if (!out.hid) return null;

  const free = (v) => isText(v) && v !== out.hid && !ALL_WORDS.includes(v) && !isLabelNoise(v);
  let title = null;
  for (let i = hidAt + 1; i < entries.length && title === null; i++) {
    if (free(entries[i][1])) title = entries[i][1];
  }
  for (let i = 0; i < entries.length && title === null; i++) {
    if (free(entries[i][1])) title = entries[i][1];
  }
  if (!title) return null;
  out.title = title;

  entries.forEach(([, v]) => {
    if (out.poster || !v || typeof v !== 'object' || Array.isArray(v)) return;
    const urls = Object.values(v).filter((u) => isText(u) && IMAGE_URL_RE.test(u));
    if (urls.length === 0) return;
    const small = urls.find((u) => /@\d+\./.test(u));
    const large = urls.find((u) => u !== small) || small;
    out.poster = { medium: small || large, large };
  });

  const dates = entries.map(([, v]) => v).filter((v) => isText(v) && v.length <= 16);
  const year = entries
    .map(([, v]) => v)
    .find((v) => Number.isInteger(v) && v >= 1900 && v <= 2100 && dates.some((d) => d.includes(String(v))));
  if (year !== undefined) out.year = year;

  let synopsis = null;
  entries.forEach(([, v]) => {
    if (isText(v) && v.length >= 20 && !/<\/?[a-z][^>]*>/i.test(v) && !/^(https?:|\/)/.test(v)) {
      if (synopsis === null || v.length > synopsis.length) synopsis = v;
    }
  });
  if (synopsis && synopsis !== out.title) out.synopsis = synopsis;
  return out;
}

function unmangleChapter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (isText(raw.url) && raw.id !== undefined && ('number' in raw || 'name' in raw)) return raw;

  const entries = Object.entries(raw);
  let url = null;
  entries.forEach(([, v]) => {
    if (url === null && isText(v) && /^\/title\/[^/]+\/\d+-[^/]+$/.test(v)) url = v;
  });
  if (!url) return null;
  const parts = /^\/title\/[^/]+\/(\d+)-(.+)$/.exec(url);
  const id = parts[1];

  let number = NaN;
  const slug = /^chapter-(\d+)(?:[.-](\d+))?(?:$|-)/.exec(parts[2]);
  if (slug) number = parseFloat(slug[1] + (slug[2] ? '.' + slug[2] : ''));
  if (!Number.isFinite(number)) {
    const small = entries.map(([, v]) => v).find((v) => typeof v === 'number' && v >= 0 && v < 5000);
    number = small === undefined ? 0 : small;
  }

  let name = '';
  for (let i = 0; i < entries.length; i++) {
    const v = entries[i][1];
    if (!isText(v)) continue;
    if (v === url || /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(v) || /\bago$/.test(v)) continue;
    name = v;
    break;
  }

  let group = null;
  entries.forEach(([, v]) => {
    if (group || !v || typeof v !== 'object' || Array.isArray(v)) return;
    const vals = Object.values(v);
    if (vals.length === 2 && vals.some((x) => typeof x === 'number') && vals.some((x) => isText(x) && x)) {
      group = { name: vals.find((x) => isText(x)) };
    }
  });
  const isOfficial = entries.some(([, v]) => v === true);
  return { id, number, name, group, isOfficial, url };
}

function mapStatus(status) {
  switch (status) {
    case 'releasing':
      return 'ONGOING';
    case 'on_hiatus':
      return 'HIATUS';
    case 'finished':
      return 'COMPLETED';
    case 'discontinued':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function ageRatingFor(contentRating) {
  switch (contentRating) {
    case 'safe':
      return 0;
    case 'suggestive':
      return 16;
    case 'erotica':
    case 'pornographic':
      return 18;
    default:
      return undefined;
  }
}

function termsToNames(terms) {
  return (terms || []).map((t) => t.title).filter(Boolean);
}

class Source {
  constructor() {
    this._chapterPages = new Map();
    this._chapterPagesAt = new Map();
    this._chapterUrls = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'popular', name: 'Most Followed' },
      { id: 'rating', name: 'Trending' },
    ];
  }

  _manager() {
    return App.createRequestManager({});
  }

  async _fetchHtml(path) {
    const response = await this._manager().schedule(
      App.createRequest({ url: `${SITE_BASE}${path}`, method: 'GET', headers: { 'User-Agent': UA } }),
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Comix HTTP ${response.status} for ${path}`);
    }
    return response.data;
  }

  async _runOracle(path, script, timeoutMs) {
    const startedAt = Date.now();
    const html = await this._fetchHtml(path);
    const fetchedAt = Date.now();
    const result = await App.executeInWebView({
      html,
      baseUrl: `${SITE_BASE}${path}`,
      script: ORACLE_PREAMBLE + script,
      timeoutMs: timeoutMs || 45000,
      runBeforePageScripts: true,
    });
    console.warn(
      `[comix] oracle ${path} took ${Date.now() - startedAt}ms ` +
        `(fetch ${fetchedAt - startedAt}ms, webview ${Date.now() - fetchedAt}ms)`,
    );
    if ('error' in result) throw new Error(`Comix oracle failed for ${path}: ${result.error}`);
    return result.value;
  }

  toPartialManga(raw) {
    const manga = unmangleManga(raw);
    if (!manga) return null;
    const authors = manga.authors || manga.author;
    const artists = manga.artists || manga.artist;
    const genres = manga.genres || manga.genre;
    const demographics = manga.demographics || manga.demographic;
    const tags = [...termsToNames(genres), ...termsToNames(demographics)];
    return {
      mangaId: manga.hid,
      title: manga.title,
      image: manga.poster ? manga.poster.large || manga.poster.medium || manga.poster.small : undefined,
      author: [...termsToNames(authors), ...termsToNames(artists)].join(' / ') || undefined,
      summary: manga.synopsis || undefined,
      tags,
      medium: 'comics',
      ageRating: ageRatingFor(manga.contentRating),
      completed: manga.status === 'finished',
      releaseDate: manga.year ? String(manga.year) : undefined,
      rating: typeof manga.ratedAvg === 'number' && manga.ratedAvg > 0 ? manga.ratedAvg : undefined,
      webURL: `${SITE_BASE}/title/${manga.hid}`,
    };
  }

  toMangaInfo(raw) {
    const manga = unmangleManga(raw);
    return {
      mangaInfo: {
        ...this.toPartialManga(manga),
        desc: manga.synopsis || undefined,
        status: mapStatus(manga.status),
      },
    };
  }

  toChapter(raw) {
    const chapter = unmangleChapter(raw);
    if (!chapter) return null;
    const num = typeof chapter.number === 'number' ? chapter.number : Number(chapter.number) || 0;
    return {
      id: String(chapter.id),
      chapterId: String(chapter.id),
      name: chapter.name && chapter.name.length ? chapter.name : `Chapter ${num}`,
      number: num,
      group: chapter.group ? chapter.group.name : chapter.isOfficial ? 'Official' : undefined,
    };
  }

  async getSearchResults(request, metadata) {
    const title = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;

    if (title) {
      const path = `/browse?keyword=${encodeURIComponent(title)}&page=${page}`;
      const value = await this._runOracle(
        path,
        `var wantedKeyword = ${JSON.stringify(title.trim().toLowerCase())};
         var wantedPage = ${page};
         __pollFor(['"manga"', '"list"'], 30000, function (entries) {
           for (var i = 0; i < entries.length; i++) {
             var params = entries[i].key[2];
             if (!params || typeof params !== 'object') continue;
             if (String(params.keyword || '').trim().toLowerCase() !== wantedKeyword) continue;
             if ((params.page || 1) !== wantedPage) continue;
             var items = __itemsOf(entries[i].data);
             if (!items) continue;
             var perPage = params.limit || items.length;
             return {
               items: items,
               more: __hasMore(entries[i].data, (wantedPage - 1) * perPage + items.length, perPage),
             };
           }
           return null;
         });`,
      );
      const results = itemsOf(value)
        .map((m) => this.toPartialManga(m))
        .filter(Boolean);
      const hasMore = value && typeof value.more === 'boolean' ? value.more : results.length >= PAGE_SIZE;
      return { results, metadata: hasMore ? { page: page + 1 } : undefined };
    }

    const data = extractInitialData(await this._fetchHtml('/'));
    const value =
      feed === 'latest'
        ? findQueryValue(data, '"manga"', '"list"', '"chapter_updated_at"') ||
          findQueryValue(data, '"manga"', '"list"', '"created_at"')
        : feed === 'rating'
          ? findQueryValue(data, '"manga"', '"top"', '"trending"')
          : findQueryValue(data, '"manga"', '"top"', '"follows"');

    const results = itemsOf(value)
      .map((m) => this.toPartialManga(m))
      .filter(Boolean);
    return { results, metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const data = extractInitialData(await this._fetchHtml(`/title/${encodeURIComponent(mangaId)}`));
    const manga = findQueryValue(data, '"manga"', '"detail"');
    if (!manga) throw new Error('manga not found');
    return this.toMangaInfo(manga);
  }

  async getChapters(mangaId) {
    const base = `/title/${encodeURIComponent(mangaId)}`;
    const value = await this._runOracle(
      `${base}?tab=chapters&page=1`,
      `var collected = [];
       var seen = {};
       var wanted = 1;
       var firstCount = 0;
       var maxPages = ${MAX_CHAPTER_PAGES};
       var walkDeadline = Date.now() + ${CHAPTER_WALK_BUDGET_MS};
       var basePath = ${JSON.stringify(base)};
       __pollFor(['"manga"', '"chapters"'], 60000, function (entries) {
         var entry = null;
         for (var i = 0; i < entries.length; i++) {
           var params = entries[i].key[3];
           if (params && params.page === wanted) { entry = entries[i]; break; }
         }
         if (!entry || !entry.data) return null;
         var items = __itemsOf(entry.data);
         if (!items || seen[wanted]) return null;
         seen[wanted] = true;
         collected = collected.concat(items);
         if (wanted === 1) firstCount = items.length;
         var perPage = (entry.key[3] && entry.key[3].limit) || firstCount;
         var more = __hasMore(entry.data, collected.length, perPage);
         var outOfBudget = Date.now() > walkDeadline;
         if (more && wanted < maxPages && !outOfBudget) {
           wanted++;
           history.pushState({}, '', basePath + '?tab=chapters&page=' + wanted);
           window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
           return null;
         }
         var total = __totalOf(entry.data);
         return {
           items: collected,
           truncated: more,
           stoppedOnBudget: outOfBudget,
           pagesWalked: wanted,
           expectedTotal: total > 0 ? total : null,
         };
       });`,
      60000,
    );

    const chapters = [];
    itemsOf(value).forEach((raw) => {
      const chapter = this.toChapter(raw);
      if (!chapter) return;
      const plain = unmangleChapter(raw);
      if (plain && plain.url) this._chapterUrls.set(chapter.id, plain.url);
      chapters.push(chapter);
    });

    if (chapters.length === 0 && itemsOf(value).length > 0) {
      throw new Error('Comix: the chapter list changed shape and could not be read');
    }

    if (value && value.truncated) {
      console.warn(
        `[comix] chapter list for ${mangaId} is incomplete: walked ${value.pagesWalked} page(s) ` +
          `and collected ${chapters.length}` +
          (value.expectedTotal ? ` of ${value.expectedTotal}` : '') +
          `. Stopped on ${value.stoppedOnBudget ? 'the time budget' : `the ${MAX_CHAPTER_PAGES}-page ceiling`}. ` +
          'The oldest chapters are the ones missing.',
      );
    }

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const key = String(chapterId);
    const cached = this._chapterPages.get(key);
    const cachedAt = this._chapterPagesAt.get(key);
    if (cached && cached.length && cachedAt !== undefined && Date.now() - cachedAt < CHAPTER_PAGES_TTL_MS) {
      return { id: chapterId, mangaId, pages: cached };
    }

    const readerPath =
      this._chapterUrls.get(key) ||
      `/title/${encodeURIComponent(mangaId)}-x/${encodeURIComponent(chapterId)}-chapter-1`;

    const value = await this._runOracle(
      readerPath,
      `__pollFor(['"chapters"', '"detail"'], 40000, function (entries) {
         for (var i = 0; i < entries.length; i++) {
           var d = entries[i].data;
           if (!d) continue;
           var pages = __pagesOf(d);
           if (pages.length) return { pages: pages };
         }
         return null;
       });`,
    );

    const pages = ((value && value.pages) || []).map((p) => p.url).filter(Boolean);
    if (pages.length === 0) throw new Error('Comix returned no pages for this chapter');
    this._chapterPages.set(key, pages);
    this._chapterPagesAt.set(key, Date.now());
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
