const SITE_BASE = 'https://mangafire.to';
const ALL_CONTENT_RATINGS = 'safe,suggestive,erotica,pornographic';
const ORACLE_TIMEOUT_MS = 170000;

const WATCH_JS = `
  var __mfSeen = [];
  function __mfNorm(u) {
    try { return new URL(String(u), location.href).href; } catch (e) { return String(u); }
  }
  (function () {
    try { performance.setResourceTimingBufferSize(3000); } catch (e) {}
    function note(u) {
      try { var n = __mfNorm(u); if (__mfSeen.indexOf(n) === -1) __mfSeen.push(n); } catch (e) {}
    }
    try {
      var origFetch = window.fetch;
      if (origFetch) {
        window.fetch = function (input) {
          try { note(typeof input === 'string' ? input : input && input.url); } catch (e) {}
          return origFetch.apply(this, arguments);
        };
      }
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { note(url); } catch (e) {}
        return origOpen.apply(this, arguments);
      };
    } catch (e) {}
  })();
  function __mfUrls(part) {
    var out = [];
    function add(u) { if (u && u.indexOf(part) !== -1 && out.indexOf(u) === -1) out.push(u); }
    try {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) add(entries[i].name);
    } catch (e) {}
    for (var j = 0; j < __mfSeen.length; j++) add(__mfSeen[j]);
    return out;
  }
  function __mfPoll(check, timeoutMs, message) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function tick() {
        var value = null;
        try { value = check(Date.now() - started); } catch (e) {}
        if (value) { resolve(value); return; }
        if (Date.now() - started >= timeoutMs) { reject(new Error(message)); return; }
        setTimeout(tick, 150);
      })();
    });
  }
`;

function safeId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
}

function ageRatingFor(rating) {
  if (!rating) return undefined;
  const r = rating.toLowerCase();
  if (r === 'safe') return 0;
  if (r === 'suggestive') return 16;
  if (r === 'erotica' || r === 'pornographic') return 18;
  return 16;
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('releas') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finish')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('drop')) return 'CANCELLED';
  return 'UNKNOWN';
}

function hidOf(mangaId) {
  return (mangaId || '').split('-')[0];
}

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

function toPartialManga(item) {
  return {
    mangaId: `${item.hid}-${item.slug}`,
    title: item.title,
    image: item.poster && (item.poster.large || item.poster.medium),
    status: mapStatus(item.status),
    ageRating: ageRatingFor(item.contentRating),
    tags: [item.type].filter(Boolean),
    chapters: item.latestChapter,
    webURL: `${SITE_BASE}${item.url || '/title/' + item.hid + '-' + item.slug}`,
    medium: 'comics',
  };
}

class Source {
  constructor() {
    this._chaptersUrlCache = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'trending', name: 'Trending' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;

    if (!query && request && request.feed === 'latest') {
      return this._latestUpdates(page);
    }

    if (!query) {
      const json = await this.requestJSON(
        `${SITE_BASE}/api/top-titles?type=trending&days=7&limit=30`
      );
      const items = Array.isArray(json && json.items) ? json.items : [];
      return { results: items.map((item) => toPartialManga(item)) };
    }

    const script = WATCH_JS + `
      __mfPoll(function () { return __mfUrls('/api/titles?keyword=').length ? true : null; }, 25000, 'no search request observed')
        .then(function () { return new Promise(function (r) { setTimeout(r, 700); }); })
        .then(function () {
          var urls = __mfUrls('/api/titles?keyword=');
          return __fetchJSON(urls[urls.length - 1]);
        })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/browse?keyword=${encodeURIComponent(query)}&sort=relevance:desc&page=${page}&content_rating=${ALL_CONTENT_RATINGS}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire search failed: ' + result.error);

    const json = result.value;
    const items = Array.isArray(json && json.items) ? json.items : [];
    const hasNext = !!(json && json.meta && json.meta.hasNext);
    return {
      results: items.map((item) => toPartialManga(item)),
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async _latestUpdates(page) {
    const wantPage = Math.max(1, parseInt(page, 10) || 1);
    const script = WATCH_JS + `
      function __mfMatches() {
        return __mfUrls('/api/titles?').filter(function (u) {
          var d = decodeURIComponent(u);
          return d.indexOf('order[chapter_updated_at]=desc') !== -1 &&
            new RegExp('[?&]page=${wantPage}(&|$)').test(d);
        });
      }
      __mfPoll(function () { return __mfMatches().length ? true : null; }, 25000, 'no latest updates request observed')
        .then(function () { return new Promise(function (r) { setTimeout(r, 700); }); })
        .then(function () {
          var urls = __mfMatches();
          return __fetchJSON(urls[urls.length - 1]);
        })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/browse?sort=chapter_updated_at:desc&page=${wantPage}&content_rating=${ALL_CONTENT_RATINGS}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire latest updates failed: ' + result.error);

    const json = result.value;
    const items = Array.isArray(json && json.items) ? json.items : [];
    const hasNext = !!(json && json.meta && json.meta.hasNext);
    return {
      results: items.map((item) => toPartialManga(item)),
      metadata: hasNext ? { page: wantPage + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const hid = safeId(hidOf(mangaId));
    const script = WATCH_JS + `
      var __mfDetailsAt = 0;
      __mfPoll(function (age) {
        var urls = __mfUrls('/api/titles/${hid}');
        var detailsUrl = urls.filter(function (u) { return u.indexOf('/chapters') === -1; })[0];
        if (!detailsUrl) return null;
        var chaptersUrl = urls.filter(function (u) { return u.indexOf('/chapters') !== -1; })[0];
        if (!__mfDetailsAt) __mfDetailsAt = age;
        if (!chaptersUrl && age - __mfDetailsAt < 1500) return null;
        return { detailsUrl: detailsUrl, chaptersUrl: chaptersUrl || null };
      }, 25000, 'no details request observed')
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire details failed: ' + result.error);

    const { detailsUrl, chaptersUrl } = result.value;
    if (chaptersUrl) {
      this._chaptersUrlCache.set(mangaId, { url: chaptersUrl, at: Date.now() });
    }

    const json = await this.requestJSON(detailsUrl);
    const series = json.data;
    return {
      mangaInfo: {
        title: series.title,
        image: series.poster && (series.poster.large || series.poster.medium),
        desc: stripHtml(series.synopsisHtml),
        status: mapStatus(series.status),
        ageRating: ageRatingFor(series.contentRating),
        tags: [
          ...(series.genres || []).map((g) => g.title),
          ...(series.themes || []).map((t) => t.title),
          ...(series.demographics || []).map((d) => d.title),
        ].filter(Boolean),
        author: (series.authors || []).map((a) => a.title).join(', ') || undefined,
        communityRating: typeof series.rating === 'number' ? series.rating : undefined,
        webURL: `${SITE_BASE}${series.url || '/title/' + mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const hid = hidOf(mangaId);
    const cached = this._chaptersUrlCache.get(mangaId);
    const cacheFresh = cached && Date.now() - cached.at < 120000;

    if (cacheFresh) {
      try {
        const firstPage = await this.requestJSON(cached.url);
        if (!(firstPage.meta && firstPage.meta.hasNext)) {
          return this._toChapterList(firstPage.items || []);
        }
      } catch (e) {
      }
    }

    const items = await this._fetchAllChapterPages(mangaId, hid);
    return this._toChapterList(items);
  }

  _toChapterList(items) {
    return items.map((c) => ({
      id: `${c.id}`,
      chapterId: `${c.id}`,
      name: c.name || `Chapter ${c.number}`,
      number: c.number,
      time: c.createdAt ? c.createdAt * 1000 : undefined,
    }));
  }

  async _fetchAllChapterPages(mangaId, rawHid) {
    const hid = safeId(rawHid);
    const script = WATCH_JS + `
      (function () {
        var PART = '/api/titles/${hid}/chapters?';
        function pageOf(u) {
          var m = /[?&]page=(\\d+)/.exec(u);
          return m ? parseInt(m[1], 10) : 0;
        }
        function urls() {
          return __mfUrls(PART).sort(function (a, b) { return pageOf(a) - pageOf(b); });
        }
        function activeNumber() {
          var active = document.querySelector('.npager__num.is-active');
          return active ? parseInt(active.textContent, 10) : 0;
        }
        function plan(want) {
          var nums = document.querySelectorAll('.npager__num');
          for (var i = 0; i < nums.length; i++) {
            if (parseInt(nums[i].textContent, 10) === want) return nums[i];
          }
          if (activeNumber() !== want - 1) return null;
          var navs = document.querySelectorAll('.npager__nav');
          for (var j = 0; j < navs.length; j++) {
            var label = (navs[j].getAttribute('aria-label') || '').toLowerCase();
            if (label.indexOf('next') !== -1 && !navs[j].disabled) return navs[j];
          }
          return 'end';
        }
        function finish() {
          var found = urls();
          if (found.length) __reportResult(found);
          else __reportError('no chapters request observed');
        }
        var requested = 1;
        function step(left) {
          if (left <= 0) { finish(); return; }
          var want = requested + 1;
          __mfPoll(function () { return plan(want); }, 6000, 'pager did not follow')
            .then(function (target) {
              if (target === 'end') { finish(); return null; }
              var before = urls().length;
              target.click();
              return __mfPoll(function () { return urls().length > before ? true : null; }, 6000, 'no request')
                .then(function () { requested = want; setTimeout(function () { step(left - 1); }, 50); });
            })
            .catch(function () { finish(); });
        }
        __mfPoll(function () { return urls().length ? true : null; }, 25000, 'no chapters request observed')
          .then(function () {
            return __mfPoll(function (age) {
              return document.querySelector('.npager__num') ? true : (age > 3000 ? true : null);
            }, 6000, '');
          })
          .then(function () { step(80); }, function (e) { __reportError(e.message || String(e)); });
      })();
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) {
      throw new Error('MangaFire chapters failed: ' + result.error);
    }

    const pageUrls = result.value;
    const pages = await Promise.all(pageUrls.map((u) => this.requestJSON(u)));
    const items = [];
    for (const page of pages) {
      if (Array.isArray(page.items)) items.push(...page.items);
    }
    return items;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = safeId(chapterId);
    const script = WATCH_JS + `
      __mfPoll(function () { return __mfUrls('/api/chapters/${id}').length ? true : null; }, 25000, 'no chapter request observed')
        .then(function () { return new Promise(function (r) { setTimeout(r, 500); }); })
        .then(function () {
          var urls = __mfUrls('/api/chapters/${id}');
          return __fetchJSON(urls[urls.length - 1]);
        })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire chapter fetch failed: ' + result.error);

    const data = result.value.data;
    const pages = (Array.isArray(data.pages) ? data.pages : []).map((p) => p.url);
    return {
      id: chapterId,
      mangaId,
      pages,
      referer: `${SITE_BASE}/`,
    };
  }

  async requestJSON(url, options) {
    const method = (options && options.method) || 'GET';
    const body = options && options.body;
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method,
      headers: body
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
