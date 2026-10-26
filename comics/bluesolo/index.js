const CONFIG = {
  "name": "Blue Solo",
  "origin": "https://bluesolo.org",
  "apiPath": "/api",
  "genres": "fetch"
};
const SITE_BASE = CONFIG.origin;
const API_BASE = SITE_BASE + (CONFIG.apiPath || '/api');
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const LIST_TTL_MS = 5 * 60 * 1000;

function plain(text) {
  let t = String(text == null ? '' : text).toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (e) {
  }
  return t.replace(/\u0131/g, 'i').replace(/\s+/g, ' ').trim();
}

const UNIT_WORDS = [
  [1000, ['sec', 'seg', 'saniye', 'detik', 'giay', 'sekunde', 'ثانية', 'ثواني', 'ثوان', 'วินาที']],
  [60000, ['min', 'dakika', 'menit', 'phut', 'دقيقة', 'دقائق', 'دقايق', 'นาที']],
  [3600000, ['hour', 'hr', 'hora', 'heure', 'saat', 'jam', 'gio', 'stunde', 'ora', 'ore', 'ساعة', 'ساعات', 'ชั่วโมง']],
  [86400000, ['day', 'dia', 'jour', 'gun', 'hari', 'ngay', 'tag', 'giorn', 'يوم', 'أيام', 'ايام', 'วัน']],
  [604800000, ['week', 'sem', 'hafta', 'minggu', 'tuan', 'woche', 'settiman', 'أسبوع', 'اسبوع', 'أسابيع', 'اسابيع', 'สัปดาห์']],
  [2592000000, ['month', 'mes', 'mois', 'ay', 'bulan', 'thang', 'monat', 'mese', 'شهر', 'أشهر', 'اشهر', 'شهور', 'เดือน']],
  [31536000000, ['year', 'ano', 'an', 'yil', 'tahun', 'nam', 'jahr', 'anno', 'سنة', 'سنوات', 'عام', 'ปี']],
];

function unitMs(word) {
  const w = plain(word);
  if (!w) return undefined;
  let best = null;
  UNIT_WORDS.forEach(([ms, stems]) => {
    stems.forEach((stem) => {
      const ok = /^[a-z]+$/.test(stem) ? (stem.length <= 2 ? w === stem || w === stem + 's' : w.indexOf(stem) === 0) : w === stem || w.indexOf(stem) === 0;
      if (ok && (!best || stem.length > best.len)) best = { ms, len: stem.length };
    });
  });
  return best ? best.ms : undefined;
}

const MONTH_NAMES = {
  jan: 0, january: 0, ene: 0, enero: 0, janeiro: 0, janvier: 0, ocak: 0, januari: 0, januar: 0, gennaio: 0,
  feb: 1, february: 1, febrero: 1, fev: 1, fevereiro: 1, fevrier: 1, subat: 1, februari: 1, februar: 1, febbraio: 1,
  mar: 2, march: 2, marzo: 2, marco: 2, mars: 2, mart: 2, maret: 2, marz: 2,
  apr: 3, april: 3, abr: 3, abril: 3, avril: 3, nisan: 3, aprile: 3,
  may: 4, mayo: 4, maio: 4, mai: 4, mayis: 4, mei: 4, maggio: 4,
  jun: 5, june: 5, junio: 5, junho: 5, juin: 5, haziran: 5, juni: 5, giugno: 5,
  jul: 6, july: 6, julio: 6, julho: 6, juillet: 6, temmuz: 6, juli: 6, luglio: 6,
  aug: 7, august: 7, ago: 7, set: 8, agosto: 7, aout: 7, agustos: 7, agustus: 7, augustus: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8, setembro: 8, septembre: 8, eylul: 8, settembre: 8,
  oct: 9, october: 9, out: 9, octubre: 9, outubro: 9, octobre: 9, ekim: 9, oktober: 9, ottobre: 9, okt: 9,
  nov: 10, november: 10, noviembre: 10, novembro: 10, novembre: 10, kasim: 10,
  มกราคม: 0, กุมภาพันธ์: 1, มีนาคม: 2, เมษายน: 3, พฤษภาคม: 4, มิถุนายน: 5,
  กรกฎาคม: 6, สิงหาคม: 7, กันยายน: 8, ตุลาคม: 9, พฤศจิกายน: 10, ธันวาคม: 11,
  يناير: 0, فبراير: 1, مارس: 2, أبريل: 3, ابريل: 3, مايو: 4, يونيو: 5, يوليو: 6, أغسطس: 7, اغسطس: 7, سبتمبر: 8, أكتوبر: 9, اكتوبر: 9, نوفمبر: 10, ديسمبر: 11,
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
  dec: 11, december: 11, dic: 11, diciembre: 11, dez: 11, dezembro: 11, decembre: 11, aralik: 11, desember: 11, des: 11, dezember: 11, dicembre: 11,
};

const YESTERDAY = /^(yesterday|ayer|ontem|hier|dun|kemarin|ieri|gestern|أمس|امس|hom qua|เมื่อวาน)$/;
const TODAY = /^(just now|today|now|hoy|hoje|aujourd'hui|bugun|hari ini|oggi|heute|اليوم|ahora|agora|maintenant|simdi|baru saja|vua xong|hom nay)$/;

function parseReleaseDate(text) {
  const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  const t = plain(raw).replace(/\s*,\s*/g, ' ').replace(/\bde\b|\bdel\b|\bdo\b|\bda\b|\bdi\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (TODAY.test(t)) return Date.now();
  if (YESTERDAY.test(t)) return Date.now() - 86400000;
  let m = /(\d+)\s*([^\d\s.,]+)/.exec(t);
  if (m && /\b(ago|atras|hace|ha|il y a|once|lalu|truoc|vor|fa)\b|منذ|ที่แล้ว|ที่ผ่านมา/.test(t)) {
    const ms = unitMs(m[2]);
    if (ms !== undefined) return Date.now() - parseInt(m[1], 10) * ms;
  }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(t);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return Number(m[2]) > 12 ? Date.UTC(year, Number(m[1]) - 1, Number(m[2])) : Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
  }
  m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^([^\d\s.]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(t);
  if (m && MONTH_NAMES[m[1]] !== undefined) return Date.UTC(+m[3], MONTH_NAMES[m[1]], +m[2]);
  m = /^(\d{1,2})(?:st|nd|rd|th|\.)? ([^\d\s.]+)\.? (\d{4})$/.exec(t);
  if (m && MONTH_NAMES[m[2]] !== undefined) return Date.UTC(+m[3], MONTH_NAMES[m[2]], +m[1]);
  return undefined;
}

const ADULT_GENRE_WORDS = /^(adult|adults|adulto|adulte|adultos|adultes|hentai|smut|erotica|erotico|erotique|erotik|erotic|nsfw|\+?18\+?|18\+|mature romance|sexual content|sin censura|uncensored|dewasa|yetiskin|nguoi lon|ผู้ใหญ่|بالغين|للبالغين|r-?18|ecchi 18)$/;
const SUGGESTIVE_GENRE_WORDS = /^(mature|maduro|madura|maduros|ecchi|borderline h|olgun|dewasa muda|truong thanh|ناضج|ايتشي|أيتشي|إيتشي|اتشي)$/;

function genreAge(names) {
  const set = (names || []).map((n) => plain(n));
  if (set.some((n) => ADULT_GENRE_WORDS.test(n))) return 18;
  if (set.some((n) => SUGGESTIVE_GENRE_WORDS.test(n))) return 16;
  return 0;
}


function cleanText(text) {
  return String(text == null ? '' : text).replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = plain(text);
  if (/^(in cors|on goin|ongoing|en cours|in progres)/.test(s)) return 'ONGOING';
  if (/^(complet|conclus|conclud|termin|finit|finish)/.test(s)) return 'COMPLETED';
  if (/^(sospes|hiatus|pausa|en pause)/.test(s)) return 'HIATUS';
  if (/^(cancell|abbandon|annul)/.test(s)) return 'CANCELLED';
  return 'UNKNOWN';
}

function isBlockedGenre(name) {
  const n = plain(name);
  return /loli|shota/.test(n) && n !== 'loli' && n !== 'shota';
}

function genresOf(comic) {
  return (comic.genres || []).map((g) => cleanText(g && g.name)).filter(Boolean);
}

function ageOf(comic) {
  if (comic.adult === true || comic.adult === 1 || comic.adult === '1') return 18;
  return genreAge(genresOf(comic));
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function slugOf(comic) {
  const m = /\/comics\/([^/?#]+)/.exec(String(comic.url || ''));
  return m ? decodeURIComponent(m[1]) : String(comic.slug || '');
}

function toPartial(comic) {
  const status = mapStatus(comic.status);
  const manga = {
    mangaId: slugOf(comic),
    title: cleanText(comic.title) || slugOf(comic),
    image: absolute(comic.thumbnail_small || comic.thumbnail) || undefined,
    status,
    completed: status === 'COMPLETED',
    ageRating: ageOf(comic),
    medium: 'comics',
    webURL: absolute(comic.url || '/comics/' + slugOf(comic)),
  };
  return manga;
}

class Source {
  constructor() {
    this._list = null;
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'all', name: 'All Titles' },
    ];
  }

  async getSearchTags() {
    try {
      const comics = await this._comics();
      const seen = new Set();
      const tags = [];
      comics.forEach((c) =>
        genresOf(c).forEach((g) => {
          const key = plain(g);
          if (seen.has(key) || isBlockedGenre(g)) return;
          seen.add(key);
          tags.push({ id: g, label: g });
        }),
      );
      return tags.sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error(CONFIG.name + ' getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = plain((request && request.title) || '');
    const feed = (request && request.feed) || 'latest';
    const wanted = ((request && request.includedTags) || []).map((t) => plain(t && t.id)).filter(Boolean);
    let comics = (await this._comics()).filter((c) => !c.hidden && !genresOf(c).some(isBlockedGenre));
    if (title) {
      comics = comics.filter((c) => [c.title].concat(Array.isArray(c.alt_titles) ? c.alt_titles : String(c.alt_titles || '').split(',')).some((t) => plain(t).indexOf(title) >= 0));
    }
    if (wanted.length) {
      comics = comics.filter((c) => {
        const have = genresOf(c).map(plain);
        return wanted.every((w) => have.indexOf(w) >= 0);
      });
    }
    if (feed === 'latest' && !title) {
      comics = comics
        .filter((c) => c.last_chapter && c.last_chapter.published_on)
        .sort((a, b) => String(b.last_chapter.published_on).localeCompare(String(a.last_chapter.published_on)));
    } else {
      comics = comics.slice().sort((a, b) => plain(a.title).localeCompare(plain(b.title)));
    }
    return { results: comics.map(toPartial), metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const comic = await this._comic(mangaId);
    const tags = genresOf(comic);
    if (tags.some(isBlockedGenre)) throw new Error(CONFIG.name + ' does not serve this title: it carries a Lolicon or Shotacon style tag');
    const status = mapStatus(comic.status);
    const people = [];
    [comic.author, comic.artist].forEach((n) => {
      cleanText(n)
        .split(/\s*[,&]\s*/)
        .forEach((p) => {
          if (p && !/^(updating|n\/a|unknown)$/i.test(p) && people.indexOf(p) < 0) people.push(p);
        });
    });
    const info = {
      mangaId,
      title: cleanText(comic.title) || mangaId,
      image: absolute(comic.thumbnail) || undefined,
      author: people.join(', ') || undefined,
      desc: cleanText(String(comic.description || '').replace(/<[^>]+>/g, ' ')) || undefined,
      status,
      completed: status === 'COMPLETED',
      tags,
      ageRating: ageOf(comic),
      medium: 'comics',
      webURL: absolute(comic.url || '/comics/' + mangaId),
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const comic = await this._comic(mangaId);
    const seen = new Set();
    const rows = [];
    (comic.chapters || []).forEach((c) => {
      if (!c || c.hidden) return;
      const m = /\/read\/(.+)$/.exec(String(c.url || ''));
      if (!m) return;
      const id = m[1].replace(/\//g, '~');
      if (seen.has(id)) return;
      seen.add(id);
      const sub = c.subchapter == null ? 0 : Number(c.subchapter);
      const number = (c.chapter == null ? 0 : Number(c.chapter)) + (Number.isFinite(sub) ? sub / 10 : 0);
      const row = { id, chapterId: id, name: cleanText(c.full_title) || `Chapter ${c.chapter}`, number: Number.isFinite(number) ? number : 0 };
      const time = Date.parse(c.published_on);
      if (!Number.isNaN(time)) row.time = time;
      const teams = (c.teams || []).map((t) => t && cleanText(t.name)).filter(Boolean);
      if (teams.length) row.group = teams.join(' & ');
      rows.push(row);
    });
    rows.sort((a, b) => a.number - b.number || String(a.id).localeCompare(String(b.id)));
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      return { ...r, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this._json('/read/' + String(chapterId).split('~').map(encodeURIComponent).join('/'));
    const pages = ((json.chapter && json.chapter.pages) || []).filter((u) => typeof u === 'string' && u).map(absolute);
    if (pages.length === 0) throw new Error(CONFIG.name + ' returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async _comics() {
    if (this._list && Date.now() - this._list.at < LIST_TTL_MS) return this._list.items;
    const json = await this._json('/comics');
    const items = Array.isArray(json.comics) ? json.comics : [];
    this._list = { at: Date.now(), items };
    return items;
  }

  async _comic(slug) {
    const json = await this._json('/comics/' + encodeURIComponent(slug));
    if (!json.comic) throw new Error(CONFIG.name + ': title not found');
    return json.comic;
  }

  async _json(path) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const request = App.createRequest({ url: API_BASE + path, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status} for ${path.split('?')[0]}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error(CONFIG.name + ' answered something that is not JSON for ' + path.split('?')[0]);
    }
  }
}

module.exports = { Source };
