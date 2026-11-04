const NAME = 'MHScans';
const SITE_BASE = 'https://mhscans.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHAPTERS_PER_PAGE = 30;
const CARDS_PER_PAGE = 24;
const FEEDS = [
  { id: 'latest', name: 'Latest' },
  { id: 'updated', name: 'Updated' },
  { id: 'views', name: 'Most Views' },
  { id: 'rating', name: 'Rating' },
  { id: 'title', name: 'A-Z' },
];

function plain(text) {
  let t = String(text == null ? '' : text).toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (e) {
  }
  return t.replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
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
  return (text || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function comicUrl(mangaId) {
  return `${SITE_BASE}/comics/${encodeURIComponent(mangaId)}`;
}

function mapStatus(className, text) {
  const s = plain(className + ' ' + text);
  if (/ongoing|emision|en curso|publicandose/.test(s)) return 'ONGOING';
  if (/completed|finalizad|completad|terminad/.test(s)) return 'COMPLETED';
  if (/hiatus|pausa/.test(s)) return 'HIATUS';
  if (/cancel/.test(s)) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('a.comic-card[href^="/comics/"]').each((_, el) => {
    const card = $(el);
    const mangaId = (card.attr('href') || '').split(/[?#]/)[0].replace(/^\/comics\//, '').replace(/\/+$/, '');
    if (!mangaId || seen.has(mangaId)) return;
    const img = card.find('img').first();
    const title = cleanText(card.find('p').first().text()) || cleanText(img.attr('alt'));
    if (!title) return;
    seen.add(mangaId);
    const manga = { mangaId, title, image: absolute(img.attr('src') || img.attr('data-src')), medium: 'comics', webURL: comicUrl(mangaId) };
    if (/completed/i.test(cleanText(card.find('p').eq(1).text()))) manga.completed = true;
    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/library`));
    const tags = [];
    const seen = new Set();
    $('a[href^="/library?genre="]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let id = href.slice(href.indexOf('=') + 1).split('&')[0];
      try {
        id = decodeURIComponent(id.replace(/\+/g, ' '));
      } catch (e) {
      }
      if (!id || seen.has(id)) return;
      seen.add(id);
      tags.push({ id, label: cleanText($(el).text()).replace(/\s*\(\d+\)\s*$/, '') || id });
    });
    return tags;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    const params = [];
    let path = '/library';
    if (query || tags.length > 0) {
      path = '/search';
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      if (tags.length > 0) params.push(`genre=${encodeURIComponent(tags[0].id)}`);
    } else if (feed !== 'latest') {
      params.push(`sort=${encodeURIComponent(feed)}`);
    }
    if (page > 1) params.push(`page=${page}`);
    const url = SITE_BASE + path + (params.length ? '?' + params.join('&') : '');

    const results = parseCards(cheerio.load(await this.requestHTML(url)));
    return { results, metadata: results.length >= CARDS_PER_PAGE ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = comicUrl(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const title = cleanText($('h1').first().text()) || cleanText($('meta[property="og:title"]').attr('content')) || mangaId;
    const statusEl = $('.comic-meta__status').first();
    const status = mapStatus(statusEl.attr('class') || '', statusEl.text());
    const tags = [];
    $('.comic-chips .comic-chip').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const info = {
      title,
      image: absolute($('meta[property="og:image"]').attr('content')),
      author: cleanText($('a[href^="/groups/"]').filter((_, el) => cleanText($(el).text())).first().text()),
      desc: cleanText($('#comic-description').text()) || cleanText($('meta[property="og:description"]').attr('content')),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    const age = genreAge(tags);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const rows = [];
    const seen = new Set();
    for (let page = 1; page <= 200; page++) {
      const $ = cheerio.load(await this.requestHTML(`${comicUrl(mangaId)}/chapters?page=${page}`));
      const found = $('a[data-chapter-num]').length;
      let fresh = 0;
      $('a[href^="/leer/"][data-chapter-num]').each((_, el) => {
        const a = $(el);
        const id = (a.attr('href') || '').slice('/leer/'.length).split(/[?#]/)[0];
        if (!id || seen.has(id)) return;
        seen.add(id);
        fresh++;
        const num = parseFloat(a.attr('data-chapter-num'));
        const dateText = cleanText(a.find('span.tracking-wide').first().text());
        rows.push({
          id,
          name: cleanText(a.attr('data-chapter-label')) || cleanText(a.find('[data-cl-title]').text()) || id,
          number: isNaN(num) ? 0 : num,
          time: dateText ? parseReleaseDate(dateText) : undefined,
        });
      });
      if (found < CHAPTERS_PER_PAGE || fresh === 0) break;
    }
    if (rows.length === 0) throw new Error(NAME + ' returned no chapters for this title');

    rows.sort((a, b) => a.number - b.number);
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const chapter = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/leer/${encodeURIComponent(chapterId)}`));
    const pages = [];
    const seen = new Set();
    $('img.page-img').each((_, el) => {
      const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error(NAME + ' returned no pages for this chapter (it may need a signed-in account)');
    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${NAME} HTTP ${response.status}: the site refused the request (a locked chapter, or a block on plain requests)`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${NAME} HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
