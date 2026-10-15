const SITE_BASE = 'https://mangafire.to';
const ALL_CONTENT_RATINGS = 'safe,suggestive,erotica,pornographic';
const ORACLE_TIMEOUT_MS = 170000;

const EARLY_TIMEOUT_MS = 45000;
const EARLY_FIRST_WAIT_MS = 10000;
const LATE_FIRST_WAIT_MS = 25000;
const SAVED_TITLE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAVED_PAGE_URLS = 400;
const WALK_MIN_MS = 40000;
const WALK_PER_PAGE_MS = 1500;
const VOLUMES_SUFFIX = '~volumes';

const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_MAX = 24;
const FRESH_SESSION_MS = 20 * 1000;

const WATCH_JS = `
  var __mfSeen = [];
  var __mfDone = [];
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
        try {
          note(url);
          var n = __mfNorm(url);
          this.addEventListener('loadend', function () {
            try { if (__mfDone.indexOf(n) === -1) __mfDone.push(n); } catch (e) {}
          });
        } catch (e) {}
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
  function __mfDoneUrls(part) {
    var out = [];
    for (var i = 0; i < __mfDone.length; i++) {
      if (__mfDone[i].indexOf(part) !== -1 && out.indexOf(__mfDone[i]) === -1) out.push(__mfDone[i]);
    }
    return out;
  }
  function __mfTick() {
    return new Promise(function (resolve) {
      var c = new MessageChannel();
      c.port1.onmessage = function () { resolve(); };
      c.port2.postMessage(0);
    });
  }
  function __mfPoll(check, timeoutMs, message) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function tick() {
        var value = null;
        try { value = check(Date.now() - started); } catch (e) {}
        if (value) { resolve(value); return; }
        var age = Date.now() - started;
        if (age >= timeoutMs) { reject(new Error(message)); return; }
        if (age < 250) __mfTick().then(tick); else setTimeout(tick, 40);
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
  return undefined;
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

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = hex ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const known = ENTITIES[name.toLowerCase()];
    return known === undefined ? whole : known;
  });
}

function stripHtml(html) {
  return decodeEntities(
    (html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  ).trim();
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

function splitId(mangaId) {
  const id = String(mangaId || '');
  return id.endsWith(VOLUMES_SUFFIX)
    ? { base: id.slice(0, -VOLUMES_SUFFIX.length), volumes: true }
    : { base: id, volumes: false };
}

function toVolumeChapter(v) {
  const number = Number(v.number);
  const label = v.name ? `Volume ${v.number}: ${String(v.name).trim()}` : `Volume ${v.number}`;
  const count = Number(v.chapterCount);
  return {
    id: String(v.id),
    chapterId: String(v.id),
    name: label,
    number: Number.isFinite(number) ? number : 0,
    group: count > 0 ? `${count} ${count === 1 ? 'chapter' : 'chapters'}` : undefined,
  };
}

class UrlMemory {
  constructor(name, cap) {
    this.name = name;
    this.cap = cap;
    this.map = null;
    this.loading = null;
    this.state = null;
  }

  _load() {
    if (this.map) return Promise.resolve(this.map);
    if (!this.loading) {
      this.state = App.createSourceStateManager();
      this.loading = this.state.retrieve(this.name).then(
        (saved) => {
          const entries = saved && Array.isArray(saved.entries) ? saved.entries : [];
          this.map = new Map(entries);
          return this.map;
        },
        () => {
          this.map = new Map();
          return this.map;
        }
      );
    }
    return this.loading;
  }

  async get(key) {
    const map = await this._load();
    return map.has(key) ? map.get(key) : null;
  }

  async set(key, value) {
    const map = await this._load();
    map.delete(key);
    map.set(key, value);
    while (map.size > this.cap) map.delete(map.keys().next().value);
    await this._save(map);
  }

  async remove(key) {
    const map = await this._load();
    if (map.delete(key)) await this._save(map);
  }

  async _save(map) {
    try {
      await this.state.store(this.name, { entries: Array.from(map.entries()) });
    } catch (e) {
    }
  }
}

function ignore() {}

class Source {
  constructor() {
    this._sessions = new Map();
    this._titles = new UrlMemory('titles-v1', 60);
    this._readers = new UrlMemory('readers-v1', 500);
    this._feeds = new UrlMemory('feeds-v1', 100);
    this._requests = null;
  }

  getSourceFeeds() {
    return [
      { id: 'trending', name: 'Trending' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async _runPage(url, build) {
    const common = { url, baseUrl: `${SITE_BASE}/` };
    const early = await App.executeInWebView(
      Object.assign({}, common, {
        script: build(EARLY_FIRST_WAIT_MS),
        timeoutMs: EARLY_TIMEOUT_MS,
        runBeforePageScripts: true,
      })
    );
    if (!('error' in early)) return early;
    return App.executeInWebView(
      Object.assign({}, common, {
        script: build(LATE_FIRST_WAIT_MS),
        timeoutMs: ORACLE_TIMEOUT_MS,
        runBeforePageScripts: false,
      })
    );
  }

  async _listing(remember, pageUrl, build, what) {
    const saved = await this._feeds.get(remember);
    if (saved) {
      try {
        return await this.requestJSON(saved);
      } catch (e) {
        this._feeds.remove(remember).catch(ignore);
      }
    }
    const result = await this._runPage(pageUrl, (wait) => WATCH_JS + build(wait));
    if ('error' in result) throw new Error(`MangaFire ${what} failed: ${result.error}`);
    const found = result.value || {};
    if (found.url) this._feeds.set(remember, found.url).catch(ignore);
    return found.json;
  }

  _pageOfTitles(json, page) {
    const items = Array.isArray(json && json.items) ? json.items : [];
    const hasNext = !!(json && json.meta && json.meta.hasNext);
    return {
      results: items.map((item) => toPartialManga(item)),
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
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

    const find = (wait) => `
      __mfPoll(function () { return __mfUrls('/api/titles?keyword=').length ? true : null; }, ${wait}, 'no search request observed')
        .then(function () { return new Promise(function (r) { setTimeout(r, 120); }); })
        .then(function () {
          var urls = __mfUrls('/api/titles?keyword=');
          var u = urls[urls.length - 1];
          return __fetchJSON(u).then(function (json) { return { url: u, json: json }; });
        })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const json = await this._listing(
      `s:${page}:${query}`,
      `${SITE_BASE}/browse?keyword=${encodeURIComponent(query)}&sort=relevance:desc&page=${page}&content_rating=${ALL_CONTENT_RATINGS}`,
      find,
      'search'
    );
    return this._pageOfTitles(json, page);
  }

  async _latestUpdates(page) {
    const wantPage = Math.max(1, parseInt(page, 10) || 1);
    const find = (wait) => `
      function __mfMatches() {
        return __mfUrls('/api/titles?').filter(function (u) {
          var d = decodeURIComponent(u);
          return d.indexOf('order[chapter_updated_at]=desc') !== -1 &&
            new RegExp('[?&]page=${wantPage}(&|$)').test(d);
        });
      }
      __mfPoll(function () { return __mfMatches().length ? true : null; }, ${wait}, 'no latest updates request observed')
        .then(function () { return new Promise(function (r) { setTimeout(r, 120); }); })
        .then(function () {
          var urls = __mfMatches();
          var u = urls[urls.length - 1];
          return __fetchJSON(u).then(function (json) { return { url: u, json: json }; });
        })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const json = await this._listing(
      `l:${wantPage}`,
      `${SITE_BASE}/browse?sort=chapter_updated_at:desc&page=${wantPage}&content_rating=${ALL_CONTENT_RATINGS}`,
      find,
      'latest updates'
    );
    return this._pageOfTitles(json, wantPage);
  }

  async getMangaDetails(mangaId) {
    const id = splitId(mangaId);
    const loaded = await this._loadDetails(id.base, !id.volumes);
    const series = loaded.json.data;
    const info = {
      title: id.volumes ? `${series.title} (Volumes)` : series.title,
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
      webURL: `${SITE_BASE}${series.url || '/title/' + id.base}`,
      medium: 'comics',
    };
    if (loaded.volumes && loaded.volumes.length) info.volumesId = id.base + VOLUMES_SUFFIX;
    return { mangaInfo: info };
  }

  async _loadDetails(base, withVolumes) {
    let session = await this._titleSession(base);
    const volumes = (s) =>
      withVolumes && s.volumesUrl
        ? this._volumeItems(base).catch((e) => {
            console.error('MangaFire volumes list failed:', (e && e.message) || e);
            return null;
          })
        : Promise.resolve(null);
    try {
      const [json, vols] = await Promise.all([this.requestJSON(session.detailsUrl), volumes(session)]);
      return { json, volumes: vols };
    } catch (e) {
      if (!this._isReused(session)) throw e;
      session = await this._titleSession(base, { fresh: true });
      const [json, vols] = await Promise.all([this.requestJSON(session.detailsUrl), volumes(session)]);
      return { json, volumes: vols };
    }
  }

  async getChapters(mangaId) {
    const id = splitId(mangaId);
    if (id.volumes) return this._volumeChapters(id.base);
    let session = await this._titleSession(id.base);
    let items;
    try {
      items = await this._loadChapterPages(session);
    } catch (e) {
      if (!this._isReused(session)) throw e;
      session = await this._titleSession(id.base, { fresh: true });
      items = await this._loadChapterPages(session);
    }
    return this._toChapterList(items);
  }

  async _loadChapterPages(session) {
    if (!session.chapterUrls.length) {
      throw new Error('MangaFire chapters failed: the title page made no chapter list request');
    }
    if (session.missing.length) {
      throw new Error(
        `MangaFire chapters incomplete: ${session.chapterUrls.length} of ${session.lastPage} pages were reachable`
      );
    }
    const pages = await Promise.all(session.chapterUrls.map((u) => this.requestJSON(u)));
    const lastPage = pages[0] && pages[0].meta && pages[0].meta.lastPage;
    if (lastPage && lastPage > session.chapterUrls.length) {
      throw new Error(`MangaFire chapter list grew to ${lastPage} pages since it was read`);
    }
    const items = [];
    const seen = new Set();
    for (const page of pages) {
      for (const item of Array.isArray(page.items) ? page.items : []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }
    return items;
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

  async _volumeItems(base) {
    let session = await this._titleSession(base);
    if (!session.volumesUrl) return null;
    try {
      return await this._fetchVolumes(session);
    } catch (e) {
      if (!this._isReused(session)) throw e;
      session = await this._titleSession(base, { fresh: true });
      return session.volumesUrl ? this._fetchVolumes(session) : null;
    }
  }

  _fetchVolumes(session) {
    if (!session.volumes) {
      session.volumes = this.requestJSON(session.volumesUrl).then(
        (json) => (Array.isArray(json && json.items) ? json.items : []).filter((v) => v.language === 'en'),
        (e) => {
          session.volumes = null;
          throw e;
        }
      );
    }
    return session.volumes;
  }

  async _volumeChapters(base) {
    const items = await this._volumeItems(base);
    if (!items) throw new Error('MangaFire volumes failed: the title page made no volumes request');
    return items.map(toVolumeChapter);
  }

  _titleSession(mangaId, options) {
    const fresh = !!(options && options.fresh);
    const hit = this._sessions.get(mangaId);
    if (!fresh && hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.promise;
    if (this._sessions.size >= SESSION_MAX) {
      const oldest = this._sessions.keys().next().value;
      this._sessions.delete(oldest);
    }
    const entry = { at: Date.now(), promise: null };
    entry.promise = this._openTitle(mangaId, fresh).then(
      (session) => {
        entry.at = Date.now();
        return session;
      },
      (e) => {
        if (this._sessions.get(mangaId) === entry) this._sessions.delete(mangaId);
        throw e;
      }
    );
    this._sessions.set(mangaId, entry);
    return entry.promise;
  }

  async _openTitle(mangaId, fresh) {
    if (!fresh) {
      const saved = await this._titles.get(mangaId);
      if (
        saved &&
        saved.detailsUrl &&
        Array.isArray(saved.chapterUrls) &&
        saved.chapterUrls.length > 0 &&
        Date.now() - (saved.savedAt || 0) < SAVED_TITLE_MAX_AGE_MS
      ) {
        return {
          detailsUrl: saved.detailsUrl,
          chapterUrls: saved.chapterUrls,
          lastPage: saved.lastPage || saved.chapterUrls.length,
          missing: [],
          hasVolumes: !!saved.hasVolumes,
          volumesUrl: saved.volumesUrl || null,
          at: saved.savedAt,
        };
      }
    }
    const session = await this._visitTitle(mangaId);
    session.at = Date.now();
    const remember =
      session.detailsUrl &&
      !session.missing.length &&
      session.chapterUrls.length > 0 &&
      session.chapterUrls.length <= MAX_SAVED_PAGE_URLS &&
      !(session.hasVolumes && !session.volumesUrl);
    if (remember) {
      this._titles
        .set(mangaId, {
          detailsUrl: session.detailsUrl,
          chapterUrls: session.chapterUrls,
          lastPage: session.lastPage,
          hasVolumes: session.hasVolumes,
          volumesUrl: session.volumesUrl,
          savedAt: session.at,
        })
        .catch(ignore);
    }
    return session;
  }

  _isReused(session) {
    return Date.now() - (session.at || 0) > FRESH_SESSION_MS;
  }

  async _visitTitle(mangaId) {
    const hid = safeId(hidOf(mangaId));
    const script = (wait) => WATCH_JS + `
      (function () {
        var HID = '${hid}';
        var DETAILS = '/api/titles/' + HID + '?';
        var PART = '/api/titles/' + HID + '/chapters?';
        var VOLUMES = '/api/titles/' + HID + '/volumes';
        function pageOf(u) {
          var m = /[?&]page=(\\d+)/.exec(u);
          return m ? parseInt(m[1], 10) : 0;
        }
        function chapterUrlsByPage(finished) {
          var byPage = {};
          var urls = finished ? __mfDoneUrls(PART) : __mfUrls(PART);
          for (var i = 0; i < urls.length; i++) {
            var p = pageOf(urls[i]);
            if (p && !byPage[p]) byPage[p] = urls[i];
          }
          return byPage;
        }
        function detailsUrl() {
          var urls = __mfUrls(DETAILS);
          return urls.length ? urls[0] : null;
        }
        function volumesUrl() {
          var urls = __mfUrls(VOLUMES);
          return urls.length ? urls[0] : null;
        }
        function pagerNumbers() {
          var out = [];
          var nums = document.querySelectorAll('.npager__num');
          for (var i = 0; i < nums.length; i++) out.push({ n: parseInt(nums[i].textContent, 10), el: nums[i] });
          return out;
        }
        function pagerSignature() {
          var active = document.querySelector('.npager__num.is-active');
          var shown = pagerNumbers().map(function (x) { return x.n; }).join(',');
          return shown + '|' + (active ? active.textContent : '');
        }
        function nextWanted(lastPage) {
          var finished = chapterUrlsByPage(true);
          for (var p = 2; p <= lastPage; p++) if (!finished[p]) return p;
          return 0;
        }
        function finish(lastPage, hasVolumes) {
          var byPage = chapterUrlsByPage();
          var urls = [];
          var missing = [];
          for (var p = 1; p <= lastPage; p++) {
            if (byPage[p]) urls.push(byPage[p]); else missing.push(p);
          }
          __reportResult({
            detailsUrl: detailsUrl(),
            chapterUrls: urls,
            lastPage: lastPage,
            missing: missing,
            hasVolumes: hasVolumes,
            volumesUrl: volumesUrl()
          });
        }
        function walk(lastPage, budget, deadline) {
          var want = nextWanted(lastPage);
          if (!want) return Promise.resolve();
          if (budget <= 0 || Date.now() > deadline) return Promise.reject(new Error('the pager did not reach page ' + want));
          return __mfPoll(function () { return pagerNumbers().length ? true : null; }, 6000, 'the pager never appeared')
            .then(function () {
              var shown = pagerNumbers();
              var target = null;
              for (var i = 0; i < shown.length; i++) if (shown[i].n === want) target = shown[i];
              if (target) {
                target.el.click();
                return __mfPoll(function () { return chapterUrlsByPage(true)[want] ? true : null; }, 6000, 'no response for page ' + want)
                  .catch(function () {});
              }
              var below = null;
              var above = null;
              for (var j = 0; j < shown.length; j++) {
                if (shown[j].n < want && (!below || shown[j].n > below.n)) below = shown[j];
                if (shown[j].n > want && (!above || shown[j].n < above.n)) above = shown[j];
              }
              var step = below || above;
              var before = pagerSignature();
              step.el.click();
              return __mfPoll(function () { return pagerSignature() !== before ? true : null; }, 3000, '').catch(function () {});
            })
            .then(function () { return walk(lastPage, budget - 1, deadline); });
        }
        __mfPoll(function () { return detailsUrl() ? true : null; }, ${wait}, 'no details request observed')
          .then(function () {
            return __mfPoll(function () { return chapterUrlsByPage()[1] ? true : null; }, 1500, '').catch(function () {});
          })
          .then(function () {
            var first = chapterUrlsByPage()[1];
            if (!first) {
              __reportResult({ detailsUrl: detailsUrl(), chapterUrls: [], lastPage: 0, missing: [], hasVolumes: false, volumesUrl: volumesUrl() });
              return null;
            }
            return Promise.all([__fetchJSON(first), __fetchJSON(detailsUrl())]).then(function (both) {
              var lastPage = (both[0] && both[0].meta && both[0].meta.lastPage) || 1;
              var hasVolumes = !!(both[1] && both[1].data && both[1].data.hasVolumes);
              var volumes = hasVolumes
                ? __mfPoll(function () { return volumesUrl() ? true : null; }, 2000, '').catch(function () {})
                : Promise.resolve();
              return volumes
                .then(function () { return walk(lastPage, lastPage * 3 + 10, Date.now() + Math.max(${WALK_MIN_MS}, lastPage * ${WALK_PER_PAGE_MS})); })
                .then(function () { finish(lastPage, hasVolumes); }, function () { finish(lastPage, hasVolumes); });
            });
          })
          .catch(function (e) { __reportError(e.message || String(e)); });
      })();
    `;
    const complete = (s) => !s.missing.length && !(s.hasVolumes && !s.volumesUrl);
    const score = (s) => s.chapterUrls.length + (s.volumesUrl ? 1 : 0);
    let best = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this._runPage(`${SITE_BASE}/title/${encodeURIComponent(mangaId)}`, script);
      if ('error' in result) {
        if (best) break;
        throw new Error('MangaFire title failed: ' + result.error);
      }
      const value = result.value || {};
      const session = {
        detailsUrl: value.detailsUrl,
        chapterUrls: Array.isArray(value.chapterUrls) ? value.chapterUrls : [],
        lastPage: value.lastPage || 0,
        missing: Array.isArray(value.missing) ? value.missing : [],
        hasVolumes: !!value.hasVolumes,
        volumesUrl: value.volumesUrl || null,
      };
      if (!session.detailsUrl) throw new Error('MangaFire title failed: no details request was seen');
      if (!best || score(session) > score(best)) best = session;
      if (complete(best)) break;
    }
    return best;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = splitId(mangaId);
    const volume = id.volumes;
    const key = `${volume ? 'v' : 'c'}:${chapterId}`;
    let json = null;
    const saved = await this._readers.get(key);
    if (saved) {
      try {
        const replayed = await this.requestJSON(saved);
        if (replayed && replayed.data && Array.isArray(replayed.data.pages)) json = replayed;
        else this._readers.remove(key).catch(ignore);
      } catch (e) {
        this._readers.remove(key).catch(ignore);
      }
    }
    if (!json) {
      const api = `${volume ? '/api/volumes/' : '/api/chapters/'}${safeId(chapterId)}?`;
      const script = (wait) => WATCH_JS + `
        __mfPoll(function () { return __mfUrls('${api}').length ? true : null; }, ${wait}, 'no reader request observed')
          .then(function () { return new Promise(function (r) { setTimeout(r, 100); }); })
          .then(function () {
            var urls = __mfUrls('${api}');
            var u = urls[urls.length - 1];
            return __fetchJSON(u).then(function (json) { return { url: u, json: json }; });
          })
          .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
      `;
      const page = `${SITE_BASE}/title/${encodeURIComponent(id.base)}/${volume ? 'volume' : 'chapter'}/${encodeURIComponent(chapterId)}`;
      const result = await this._runPage(page, script);
      if ('error' in result) {
        throw new Error(`MangaFire ${volume ? 'volume' : 'chapter'} fetch failed: ${result.error}`);
      }
      const found = result.value || {};
      json = found.json;
      if (found.url) this._readers.set(key, found.url).catch(ignore);
    }

    const data = json && json.data;
    if (!data || !Array.isArray(data.pages)) {
      throw new Error(`MangaFire ${volume ? 'volume' : 'chapter'} fetch failed: the reader gave no pages`);
    }
    const pages = data.pages.map((p) => p.url).filter(Boolean);
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
    if (!this._requests) this._requests = App.createRequestManager({});
    const manager = this._requests;
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
