const SITE_BASE = 'https://www.webnovel.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  'This chapter is a Webnovel members-only (VIP) chapter and cannot be unlocked here. Read it on webnovel.com or in the official Webnovel app.';

const LOCKED_PREVIEW_NOTE =
  'Preview only. The rest of this chapter is members-only (VIP) on Webnovel and cannot be unlocked here. Read it on webnovel.com or in the official Webnovel app.';

const LOCKED_SUFFIX = ' (Locked, Coins)';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function coverUrl(bookId, cacheId) {
  if (!bookId) return '';
  const suffix = cacheId ? `&imageId=${encodeURIComponent(String(cacheId))}` : '';
  return `https://book-pic.webnovel.com/bookcover/${encodeURIComponent(String(bookId))}?imageMogr2/thumbnail/300x${suffix}`;
}

function absoluteImage(src) {
  if (!src) return '';
  const trimmed = String(src).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  return trimmed;
}

function biggerCover(url) {
  return String(url || '').replace(/(imageMogr2\/thumbnail\/)\d+x/, '$1300x');
}

function extractBookId(href) {
  if (!href) return '';
  const path = String(href).split('?')[0].split('#')[0];
  let m = path.match(/_(\d+)\/?$/);
  if (m) return m[1];
  m = path.match(/\/book\/(\d+)\/?$/);
  return m ? m[1] : '';
}

function mapActionStatus(actionStatus) {
  if (actionStatus === 30) return 'ONGOING';
  if (actionStatus === 40) return 'COMPLETED';
  return 'UNKNOWN';
}

function plainText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|nbsp|lt|gt|quot|apos|amp);/gi, (all, code) => {
      const name = code.toLowerCase();
      if (name === 'nbsp') return ' ';
      if (name === 'lt') return '<';
      if (name === 'gt') return '>';
      if (name === 'quot') return '"';
      if (name === 'apos') return "'";
      if (name === 'amp') return '&';
      const point = name.charAt(1) === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : all;
    })
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findBalancedObject(text, fromIndex) {
  const openIdx = text.indexOf('{', fromIndex);
  if (openIdx === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

function sanitizeLooseJson(raw) {
  const validEscapes = '"\\/bfnrt';
  let out = '';
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString && ch === '\\') {
      const next = raw[i + 1];
      if (next !== undefined && validEscapes.indexOf(next) !== -1) {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
        out += raw.slice(i, i + 6);
        i += 5;
        continue;
      }
      if (next !== undefined) {
        out += next;
        i += 1;
      }
      continue;
    }
    if (ch === '"') inString = !inString;
    out += ch;
  }
  return out;
}

function parseEmbeddedObject(html, anchor) {
  const anchorIdx = html.indexOf(anchor);
  if (anchorIdx === -1) return null;
  const raw = findBalancedObject(html, anchorIdx + anchor.length);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      return JSON.parse(sanitizeLooseJson(raw));
    } catch (e2) {
      console.error('Webnovel: failed to parse embedded object for', anchor, e2);
      return null;
    }
  }
}

function parseStoriesListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.j_category_wrapper li').each((_, li) => {
    const $li = $(li);
    const $link = $li.find('h3 a[href^="/book/"]').first();
    const href = $link.attr('href') || '';
    const bookId = extractBookId(href);
    if (!bookId) return;
    const title = cleanText($link.text()) || bookId;
    const $img = $li.find('img').first();
    const image = biggerCover(absoluteImage($img.attr('data-original') || $img.attr('src')));

    const tags = [];
    $li.find('p.mb4 a[href^="/tags/"]').each((__, a) => {
      const label = cleanText($(a).attr('title')).replace(/\s+Stories$/i, '');
      if (label) tags.push(label);
    });

    const $descP = $li.find('p').filter((__, p) => !$(p).hasClass('mb4'));
    const summary = plainText($descP.first().text());

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    if (tags.length) manga.tags = tags;
    if (summary) manga.summary = summary;
    results.push(manga);
  });
  return results;
}

function parseTagListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.j_bookList .g_book_item').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('a[href^="/book/"]').first();
    const bookId = String($el.attr('data-report-did') || '').trim() || extractBookId($link.attr('href'));
    if (!bookId) return;
    const title = cleanText($link.attr('title')) || cleanText($el.find('h3').first().text()) || bookId;
    const $img = $el.find('img').first();
    const image = biggerCover(absoluteImage($img.attr('data-original') || $img.attr('src')));

    const tags = [];
    $el.find('.g_tags a[href^="/tags/"]').each((__, a) => {
      const label = cleanText($(a).attr('title')).replace(/\s+Stories$/i, '') || cleanText($(a).text());
      if (label) tags.push(label);
    });

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    if (tags.length) manga.tags = tags;
    results.push(manga);
  });
  return results;
}

function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.j_result_wrap li').each((_, li) => {
    const $li = $(li);
    const $title = $li.find('h3 a').first();
    const bookId = String($li.find('a[data-bookid]').first().attr('data-bookid') || '').trim() || extractBookId($title.attr('href'));
    if (!bookId) return;
    const title = cleanText($title.attr('title')) || cleanText($title.text()) || bookId;
    const $img = $li.find('img').first();
    const image = biggerCover(absoluteImage($img.attr('data-original') || $img.attr('src'))) || coverUrl(bookId);

    const tags = [];
    $li.find('.g_tags a').each((__, a) => {
      const href = $(a).attr('href') || '';
      const label =
        href.indexOf('/tags/') === 0
          ? cleanText($(a).attr('title')).replace(/\s+Stories$/i, '') || titleCase(cleanText($(a).text()))
          : titleCase(cleanText($(a).text()));
      if (label && tags.indexOf(label) === -1) tags.push(label);
    });

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    if (tags.length) manga.tags = tags;
    results.push(manga);
  });
  const flag = /g_data\.isLast\s*=\s*"(\d)"/.exec(html);
  return { results, isLast: flag ? flag[1] === '1' : results.length === 0 };
}

function looksLikeCheckPage(html) {
  return /<title[^>]*>\s*just a moment/i.test(String(html || '').slice(0, 8192));
}

function describePage(html) {
  const text = String(html || '');
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text);
  const links = text.match(/href="[^"]*\/book\/[^"]*"/g) || [];
  return `page "${cleanText(title && title[1]).slice(0, 60)}", ${text.length} characters, ${links.length} book links`;
}

const PROBE_CHUNK = 1800;

function probe(label, text) {
  const body = String(text || '');
  for (let i = 0, n = 1; i < body.length && n <= 6; i += PROBE_CHUNK, n += 1) {
    console.error(`Webnovel probe ${label} [${n}]: ${body.slice(i, i + PROBE_CHUNK)}`);
  }
}

function pageFacts(html) {
  const text = String(html || '');
  const pick = (re) => {
    const found = re.exec(text);
    return found ? found[1] : '';
  };
  const flags = ['g_data', 'bookInfo', 'volumeItems', 'chapInfo', '__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', 'application/ld+json'];
  const lines = [
    describePage(text),
    `canonical ${pick(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)}`,
    `og:url ${pick(/<meta[^>]+property="og:url"[^>]+content="([^"]*)"/i)}`,
    `html ${cleanText(pick(/<html([^>]*)>/i)).slice(0, 120)}`,
    flags.map((flag) => `${flag}=${text.indexOf(flag) !== -1}`).join(' '),
  ];
  const heads = [];
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let found = scripts.exec(text);
  while (found && heads.length < 30) {
    const inline = cleanText(found[2]);
    heads.push(`${cleanText(found[1]).slice(0, 60)}|${inline.length}|${inline.slice(0, 60)}`);
    found = scripts.exec(text);
  }
  lines.push(`scripts: ${heads.join(' ## ')}`);
  return lines.join('\n');
}

function skeleton(html, limit) {
  const text = String(html || '');
  if (text.length > 1500000) return `(markup of ${text.length} characters not walked)`;
  const $ = cheerio.load(text);
  const out = [];
  let size = 0;
  const signature = (el) => `${el.name}.${(el.attribs && el.attribs.class) || ''}`;
  const walk = (el, depth) => {
    if (size >= limit || depth > 16) return;
    const attrs = el.attribs || {};
    let line = `${new Array(Math.min(depth, 12) + 1).join(' ')}${el.name}`;
    if (attrs.id) line += `#${attrs.id}`;
    if (attrs.class) line += `.${attrs.class.trim().split(/\s+/).slice(0, 4).join('.')}`;
    ['href', 'src', 'data-src', 'data-original', 'data-bookid', 'data-report-did', 'data-islast', 'title', 'content'].forEach((name) => {
      if (attrs[name]) line += ` ${name}=${String(attrs[name]).slice(0, 70)}`;
    });
    const own = (el.children || [])
      .filter((child) => child.type === 'text')
      .map((child) => child.data)
      .join(' ');
    const words = cleanText(own).slice(0, 40);
    if (words) line += ` "${words}"`;
    out.push(line);
    size += line.length + 1;
    const kids = (el.children || []).filter(
      (child) => child.type === 'tag' && ['script', 'style', 'svg', 'noscript', 'link', 'path'].indexOf(child.name) === -1,
    );
    let run = 0;
    for (let i = 0; i < kids.length; i += 1) {
      const same = i > 0 && signature(kids[i]) === signature(kids[i - 1]);
      run = same ? run + 1 : 0;
      if (run >= 2) {
        if (i === kids.length - 1 || signature(kids[i + 1]) !== signature(kids[i])) {
          out.push(`${new Array(Math.min(depth, 12) + 2).join(' ')}... ${run - 1} more like it`);
        }
        continue;
      }
      walk(kids[i], depth + 1);
    }
  };
  const head = $('head title').first().text();
  out.push(`title "${cleanText(head).slice(0, 80)}"`);
  const body = $('body').get(0);
  if (body) walk(body, 0);
  return out.join('\n');
}

function probePage(label, html) {
  probe(`${label} facts`, pageFacts(html));
  try {
    probe(`${label} skeleton`, skeleton(html, 5400));
  } catch (e) {
    console.error(`Webnovel probe ${label} skeleton failed: ${e && e.message}`);
  }
}

function parseBookLinks(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = {};
  $('a[href]').each((_, a) => {
    const $a = $(a);
    const linked = extractBookId($a.attr('href'));
    if (!linked) return;
    const reported = String($a.attr('data-report-bid') || '').trim();
    const bookId = reported || linked;
    if (seen[bookId]) return;
    const $row = $a.closest('li, .g_book_item, article');
    const scope = reported || !$row.length ? $a : $row.first();
    const title =
      cleanText($a.attr('title')) || cleanText(scope.find('h3, h2, h4').first().text()) || cleanText($a.text());
    if (!title) return;
    seen[bookId] = true;
    const $img = scope.find('img').first();
    let image = biggerCover(absoluteImage($img.attr('data-original') || $img.attr('data-src') || $img.attr('src')));
    if (!/^https?:\/\//i.test(image) || /imgPh|\/_next\/static\//.test(image)) image = coverUrl(bookId);
    const manga = { mangaId: bookId, title, image, webURL: `${SITE_BASE}/book/${bookId}`, medium: 'novel' };
    const summary = plainText(scope.find('p').first().text());
    if (summary) manga.summary = summary;
    results.push({ manga, reported: reported !== '', inRow: $row.length > 0 });
  });
  const reported = results.filter((entry) => entry.reported);
  const rows = results.filter((entry) => entry.inRow);
  return (reported.length ? reported : rows.length ? rows : results).map((entry) => entry.manga);
}

function pickListing(html, primary, marker, page, what) {
  if (primary.length || html.indexOf(marker) !== -1) return primary;
  const fallback = parseBookLinks(html);
  if (fallback.length || page > 1) return fallback;
  probePage(`${what} listing`, html);
  throw new Error(`Webnovel: no titles found on the ${what} page (${describePage(html)})`);
}

function nextData(html) {
  const found = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ''));
  if (!found) return null;
  try {
    return JSON.parse(found[1]);
  } catch (e) {
    return null;
  }
}

function findDeep(value, test, depth) {
  if (!value || typeof value !== 'object' || depth < 0) return null;
  if (!Array.isArray(value) && test(value)) return value;
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const hit = findDeep(value[keys[i]], test, depth - 1);
    if (hit) return hit;
  }
  return null;
}

function collectChapterObjects(value, out, depth) {
  if (!value || typeof value !== 'object' || depth < 0 || out.length > 20000) return out;
  if (!Array.isArray(value) && value.chapterId !== undefined && (typeof value.chapterName === 'string' || typeof value.name === 'string')) {
    out.push(value);
    return out;
  }
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) collectChapterObjects(value[keys[i]], out, depth - 1);
  return out;
}

function outline(value, label, depth, lines) {
  if (lines.length > 150) return;
  if (Array.isArray(value)) {
    lines.push(`${label} [${value.length}]`);
    if (value.length && depth > 0) outline(value[0], `${label}[0]`, depth - 1, lines);
    return;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    lines.push(`${label} {${keys.slice(0, 14).join(',')}${keys.length > 14 ? `,...${keys.length}` : ''}}`);
    if (depth > 0) keys.slice(0, 14).forEach((key) => outline(value[key], `${label}.${key}`, depth - 1, lines));
    return;
  }
  lines.push(`${label} = ${String(value).slice(0, 40)}`);
}

function hrefShapes(html) {
  const text = String(html || '');
  if (text.length > 1500000) return '';
  const $ = cheerio.load(text);
  const seen = {};
  const shapes = [];
  $('a[href]').each((_, a) => {
    const shape = String($(a).attr('href')).replace(/\d{8,}/g, '#').slice(0, 90);
    if (!seen[shape] && shapes.length < 60) {
      seen[shape] = true;
      shapes.push(shape);
    }
  });
  return shapes.join(' | ');
}

function chapterEntry(c, order) {
  const chapterId = String((c && c.chapterId) || '');
  if (!chapterId) return null;
  const paid = c.isAuth === 0 || (c.isAuth === undefined && (c.isVip || 0) > 0);
  const entry = {
    id: chapterId,
    chapterId,
    name: (cleanText(c.chapterName || c.name) || `Chapter ${order}`) + (paid ? LOCKED_SUFFIX : ''),
    number: order,
  };
  if (typeof c.publishTime === 'number' && c.publishTime > 0) entry.time = c.publishTime;
  return entry;
}

function chaptersFromPage(html, mangaId) {
  const next = nextData(html);
  if (next) {
    const chapters = [];
    const seen = {};
    collectChapterObjects(next, [], 14).forEach((c) => {
      const id = String(c.chapterId);
      if (seen[id]) return;
      seen[id] = true;
      const entry = chapterEntry(c, chapters.length + 1);
      if (entry) chapters.push(entry);
    });
    if (chapters.length >= 2) return chapters;
  }
  return linkChapters(html, mangaId);
}

function domDetails(html, mangaId) {
  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text());
  if (!title) return null;
  const part = (name) => $(`[class*="${name}"]`);
  const authorLink = part('NewBookInfo_author').first();
  const author = cleanText(authorLink.attr('title')) || cleanText(authorLink.text()).replace(/^by\s+/i, '');
  const tags = [];
  const category = cleanText(part('NewBookInfo_extra').first().find('span.ell').last().text());
  if (category) tags.push(category);
  part('BookContent_tag__').each((_, a) => {
    const label = titleCase(cleanText($(a).text()).replace(/^#/, ''));
    if (label && tags.indexOf(label) === -1) tags.push(label);
  });
  const box = part('BookContent_desc__').first().clone();
  box.find('[class*="showMoreDesc"]').remove();
  box.find('br').replaceWith('\n');
  const desc = plainText(box.text());
  const chapterLine = cleanText(part('BookContent_chapterInfo').first().find('.ell').first().text());
  const count = /([\d,]+)\s+Chapters?/i.exec(chapterLine);
  const extra = cleanText(part('BookContent_chapterExtra').first().text());
  const status = /^completed/i.test(extra) ? 'COMPLETED' : /update|new ch/i.test(extra) ? 'ONGOING' : 'UNKNOWN';
  const info = findDeep(nextData(html), (o) => typeof o.bookName === 'string' && o.bookId !== undefined, 10);
  const mangaInfo = {
    mangaId,
    title,
    image: coverUrl(mangaId, info && info.coverUpdateTime),
    desc,
    status,
    completed: status === 'COMPLETED',
    tags,
    webURL: `${SITE_BASE}/book/${mangaId}`,
    medium: 'novel',
  };
  if (author) mangaInfo.author = author;
  if (count) mangaInfo.chapters = parseInt(count[1].replace(/,/g, ''), 10);
  return { mangaInfo };
}

function metaDetails(html, mangaId) {
  const $ = cheerio.load(html);
  const meta = (key) => cleanText($(`meta[property="${key}"]`).attr('content') || $(`meta[name="${key}"]`).attr('content'));
  const title = meta('og:title').replace(/\s*[-|]\s*Web ?Novel.*$/i, '') || cleanText($('h1').first().text());
  if (!title) return null;
  const cover = meta('og:image');
  return {
    mangaInfo: {
      mangaId,
      title,
      image: /^https?:\/\//i.test(cover) ? cover : coverUrl(mangaId),
      desc: plainText(meta('og:description') || meta('description')),
      status: 'UNKNOWN',
      completed: false,
      tags: [],
      webURL: `${SITE_BASE}/book/${mangaId}`,
      medium: 'novel',
    },
  };
}

function linkChapters(html, mangaId) {
  const $ = cheerio.load(html);
  const chapters = [];
  const seen = {};
  $('a[href]').each((_, a) => {
    const found = /\/book\/(?:[^\/?#]*_)?(\d+)\/(?:[^\/?#]*_)?(\d{8,})\/?(?:[?#]|$)/.exec($(a).attr('href') || '');
    if (!found || found[1] !== mangaId || seen[found[2]]) return;
    const name = cleanText($(a).attr('title')) || cleanText($(a).text());
    if (!name) return;
    seen[found[2]] = true;
    chapters.push({ id: found[2], chapterId: found[2], name, number: chapters.length + 1 });
  });
  return chapters;
}

function paragraphText(html) {
  const $ = cheerio.load(html);
  const groups = [];
  $('p').each((_, p) => {
    const text = plainText($(p).text());
    if (text.length < 2) return;
    const parent = p.parent;
    let group = groups.filter((g) => g.parent === parent)[0];
    if (!group) {
      group = { parent, paragraphs: [], size: 0 };
      groups.push(group);
    }
    group.paragraphs.push(text);
    group.size += text.length;
  });
  groups.sort((a, b) => b.size - a.size);
  const best = groups[0];
  return best && best.paragraphs.length >= 5 && best.size >= 800 ? best.paragraphs.join('\n\n') : '';
}

function mapApiItem(raw) {
  const bookId = String((raw && raw.bookId) || '');
  if (!bookId) return null;
  const manga = {
    mangaId: bookId,
    title: cleanText(raw.bookName || raw.name) || bookId,
    image: coverUrl(bookId, raw.coverUpdateTime),
    webURL: `${SITE_BASE}/book/${bookId}`,
    medium: 'novel',
  };
  const tags = [];
  if (raw.categoryName) tags.push(cleanText(raw.categoryName));
  const infos = Array.isArray(raw.tagInfo) ? raw.tagInfo : Array.isArray(raw.tagInfos) ? raw.tagInfos : [];
  infos.forEach((t) => {
    const label = titleCase(t && t.tagName);
    if (label && tags.indexOf(label) === -1) tags.push(label);
  });
  if (tags.length) manga.tags = tags;
  if (typeof raw.totalScore === 'number' && raw.totalScore > 0) manga.rating = raw.totalScore;
  const summary = plainText(raw.description);
  if (summary) manga.summary = summary;
  return manga;
}

function dataOutline(html) {
  const next = nextData(html);
  if (!next) return 'no __NEXT_DATA__';
  const lines = [];
  outline(next, 'next', 6, lines);
  return lines.join('\n').slice(0, 5400);
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'novel-fantasy-male', name: 'Fantasy' },
      { id: 'novel-eastern-male', name: 'Eastern' },
      { id: 'novel-urban-male', name: 'Urban' },
      { id: 'novel-action-male', name: 'Action' },
      { id: 'novel-history-male', name: 'History' },
      { id: 'novel-games-male', name: 'Games' },
      { id: 'novel-scifi-male', name: 'Sci-fi' },
      { id: 'novel-fantasy-female', name: 'Fantasy (Female Lead)' },
      { id: 'novel-urban-female', name: 'Urban (Female Lead)' },
      { id: 'novel-teen-female', name: 'Teen (Female Lead)' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/stories/novel`);
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href^="/tags/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^\/tags\/([a-z0-9-]+-novel)(?:$|[/?#])/i);
        if (!m || seen[m[1]]) return;
        seen[m[1]] = true;
        const label = cleanText($(el).attr('title') || $(el).text()).replace(/\s+Stories$/i, '');
        if (label) tags.push({ id: m[1], label });
      });
      if (!tags.length) {
        $('a[href^="/stories/novel-"]').each((_, el) => {
          const m = (($(el).attr('href') || '').match(/^\/stories\/(novel-[a-z0-9-]+-(male|female))(?:$|[/?#])/i));
          if (!m || seen[m[1]]) return;
          seen[m[1]] = true;
          const name = cleanText($(el).attr('title') || $(el).find('h5').first().text());
          if (name) tags.push({ id: m[1], label: `${name} (${m[2].toLowerCase() === 'female' ? 'Female' : 'Male'} Lead)` });
        });
      }
      return tags;
    } catch (e) {
      console.error('Webnovel getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const paged = (path) => (page > 1 ? `${path}?${qs({ pageIndex: page })}` : path);

    try {
      if (query) {
        if (page > 1 && this.mobileSearch) return this.searchApiPage(query, page);
        const html = await this.requestHTML(`${SITE_BASE}/search?${qs({ keywords: query, pageIndex: page })}`);
        const parsed = parseSearchPage(html);
        if (!parsed.results.length && html.indexOf('j_result_wrap') === -1) {
          this.mobileSearch = true;
          if (page > 1) return this.searchApiPage(query, page);
        }
        const results = pickListing(html, parsed.results, 'j_result_wrap', page, 'search');
        const last = /g_data\.isLast\s*=\s*"1"/.test(html);
        return this.listingAnswer(`search ${query}`, page, results, last);
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      if (tagId) {
        if (/^novel-[a-z0-9-]+-(?:male|female)$/i.test(tagId)) {
          const answer = await this.feedPage(tagId, page);
          return this.listingAnswer(`tag ${tagId}`, page, answer.results, answer.last);
        }
        const html = await this.requestHTML(`${SITE_BASE}${paged(`/tags/${encodeURIComponent(tagId)}`)}`);
        const results = pickListing(html, parseTagListing(html), 'j_bookList', page, 'genre');
        const last = /g_data\.isLast\s*=\s*"1"/.test(html);
        return this.listingAnswer(`tag ${tagId}`, page, results, last);
      }

      const wanted = request && request.feed;
      const feed = this.getSourceFeeds().some((f) => f.id === wanted) ? wanted : 'novel-fantasy-male';
      const answer = await this.feedPage(feed, page);
      return this.listingAnswer(`feed ${feed}`, page, answer.results, answer.last);
    } catch (e) {
      console.error('Webnovel getSearchResults failed:', e);
      throw e;
    }
  }

  async apiGet(path, params) {
    const failures = [];
    if (this.apiMode !== 'webview') {
      try {
        const manager = App.createRequestManager({});
        const response = await manager.schedule(
          App.createRequest({
            url: `${SITE_BASE}${path}?${qs(params)}`,
            method: 'GET',
            headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          }),
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status} ${String(response.data).slice(0, 160)}`);
        }
        const json = JSON.parse(response.data);
        if (json && +json.code === 0 && json.data) {
          this.apiMode = 'plain';
          return json.data;
        }
        throw new Error(`answer with code ${json && json.code}`);
      } catch (e) {
        failures.push(`plain request: ${(e && e.message) || e}`);
      }
    }
    try {
      const script = `(async function () {
        try {
          var match = /(?:^|;\\s*)_csrfToken=([^;]*)/.exec(document.cookie);
          var params = ${JSON.stringify(params)};
          if (match) params._csrfToken = decodeURIComponent(match[1]);
          var query = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
          var json = await __fetchJSON(${JSON.stringify(path)} + '?' + query);
          __reportResult(json);
        } catch (e) { __reportError(String((e && e.message) || e)); }
      })();`;
      const result = await App.executeInWebView({ url: `${SITE_BASE}/stories/novel`, script, timeoutMs: 40000 });
      if (result && result.error) throw new Error(result.error);
      const json = result && result.value;
      if (json && +json.code === 0 && json.data) {
        this.apiMode = 'webview';
        return json.data;
      }
      throw new Error(`answer with code ${json && json.code}`);
    } catch (e) {
      failures.push(`web view: ${(e && e.message) || e}`);
    }
    console.error(`Webnovel api ${path} failed (${failures.join('; ')})`);
    throw new Error(`Webnovel: the next page could not be loaded (${failures.join('; ')})`);
  }

  async feedPage(slug, page) {
    if (!this.categoryIds) this.categoryIds = {};
    const route = `/stories/${encodeURIComponent(slug)}`;
    const fromApi = async (categoryId) => {
      const data = await this.apiGet('/go/pcm/category/categoryPage', {
        categoryId,
        categoryType: 1,
        orderBy: 1,
        pageIndex: page,
        bookStatus: 0,
        language: 'en',
      });
      if (!Array.isArray(data.items)) {
        probe('categoryPage answer', JSON.stringify(data).slice(0, 1500));
        throw new Error('Webnovel: the category api answered without a list of titles');
      }
      const results = data.items.map(mapApiItem).filter(Boolean);
      return { results, last: !!data.isLast || results.length === 0 };
    };
    if (page > 1 && this.categoryIds[slug]) return fromApi(this.categoryIds[slug]);
    const html = await this.requestHTML(`${SITE_BASE}${page > 1 ? `${route}?${qs({ pageIndex: page })}` : route}`);
    const reported = /data-report-genreid="(\d+)"/.exec(html);
    if (reported) {
      this.categoryIds[slug] = reported[1];
      if (page > 1) return fromApi(reported[1]);
    }
    const results = pickListing(html, parseStoriesListing(html), 'j_category_wrapper', page, 'browse');
    return { results, last: /data-islast="true"/.test(html) };
  }

  async searchApiPage(query, page) {
    const data = await this.apiGet('/go/pcm/search/result', { keywords: query, type: 'novel', pageIndex: page });
    const items = data.bookInfo && Array.isArray(data.bookInfo.bookItems) ? data.bookInfo.bookItems : null;
    if (!items) {
      probe('search api answer', JSON.stringify(data).slice(0, 1500));
      throw new Error('Webnovel: the search api answered without a list of titles');
    }
    const results = items.map(mapApiItem).filter(Boolean);
    const last = !!data.bookInfo.isLast || results.length === 0;
    return { results, metadata: !last ? { page: page + 1 } : undefined };
  }

  listingAnswer(key, page, results, last) {
    const signature = results.map((manga) => manga.mangaId).join(',');
    if (!this.pageSignatures) this.pageSignatures = {};
    const previous = this.pageSignatures[`${key}#${page - 1}`];
    this.pageSignatures[`${key}#${page}`] = signature;
    if (page > 1 && previous === signature) {
      console.error(`Webnovel: page ${page} of ${key} repeated page ${page - 1}, so the listing ends here`);
      return { results: [], metadata: undefined };
    }
    return { results, metadata: !last && results.length > 0 ? { page: page + 1 } : undefined };
  }

  fetchBookData(mangaId) {
    const cached = this.bookCache && this.bookCache.get(mangaId);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.promise;
    if (!this.bookCache) this.bookCache = new Map();
    const promise = (async () => {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}`;
      const html = await this.requestHTML(url);
      const data = parseEmbeddedObject(html, 'g_data.book=');
      if (!data || !data.bookInfo) {
        return { html };
      }
      return data;
    })();
    this.bookCache.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this.bookCache.delete(mangaId));
    if (this.bookCache.size > 3) this.bookCache.delete(this.bookCache.keys().next().value);
    return promise;
  }

  async getMangaDetails(mangaId) {
    const data = await this.fetchBookData(mangaId);
    if (!data.bookInfo) {
      const fromPage = domDetails(data.html || '', mangaId) || metaDetails(data.html || '', mangaId);
      if (!fromPage) {
        probePage('book', data.html);
        throw new Error(`Webnovel: book data not found (${describePage(data.html)})`);
      }
      return fromPage;
    }
    const info = data.bookInfo || {};
    const bookId = String(info.bookId || mangaId);

    const authorName =
      cleanText(info.authorName) ||
      cleanText((Array.isArray(info.authorItems) && info.authorItems[0] && info.authorItems[0].name) || '');

    const tags = [];
    if (info.categoryName) tags.push(cleanText(info.categoryName));
    if (Array.isArray(info.tagInfos)) {
      for (const t of info.tagInfos) {
        const label = titleCase(t && t.tagName);
        if (label && tags.indexOf(label) === -1) tags.push(label);
      }
    }

    const mangaInfo = {
      mangaId: bookId,
      title: cleanText(info.bookName) || mangaId,
      image: coverUrl(bookId, info.coverUpdateTime),
      desc: plainText(info.description),
      status: mapActionStatus(info.actionStatus),
      tags,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    mangaInfo.completed = mangaInfo.status === 'COMPLETED';
    if (authorName) mangaInfo.author = authorName;
    if (typeof info.totalScore === 'number' && info.totalScore > 0) mangaInfo.rating = info.totalScore;
    if (typeof info.pvNum === 'number' && info.pvNum > 0) mangaInfo.views = info.pvNum;
    if (typeof info.totalChapterNum === 'number' && info.totalChapterNum > 0) {
      mangaInfo.chapters = info.totalChapterNum;
    }

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const data = await this.fetchBookData(mangaId);
      if (!data.bookInfo) return await this.mobileChapters(mangaId, data.html || '');
      const volumes = Array.isArray(data.volumeItems) ? data.volumeItems : [];
      const chapters = [];
      let order = 0;
      for (const vol of volumes) {
        const items = Array.isArray(vol.chapterItems) ? vol.chapterItems : [];
        for (const c of items) {
          const chapter = chapterEntry(c, order + 1);
          if (!chapter) continue;
          order += 1;
          chapters.push(chapter);
        }
      }
      if (chapters.length === 0) {
        throw new Error('Webnovel: this page lists no chapters (the catalog may have moved off the page)');
      }
      return chapters;
    } catch (e) {
      console.error('Webnovel getChapters failed:', e);
      throw e;
    }
  }

  async mobileChapters(mangaId, html) {
    const own = chaptersFromPage(html, mangaId);
    if (own.length) return own;
    const tried = [];
    const routes = [`/book/${mangaId}/catalog`, `/book/${mangaId}/chapters`];
    for (let i = 0; i < routes.length; i += 1) {
      try {
        const page = await this.requestHTML(`${SITE_BASE}${routes[i]}`);
        const found = chaptersFromPage(page, mangaId);
        if (found.length) return found;
        tried.push(`${routes[i]} had no chapters`);
        probePage(`catalog ${routes[i]}`, page);
        probe(`catalog ${routes[i]} data`, dataOutline(page));
      } catch (e) {
        tried.push(`${routes[i]}: ${(e && e.message) || 'failed'}`);
      }
    }
    probe('book page links', hrefShapes(html));
    probe('book page data', dataOutline(html));
    const sample = /"(?:chapterId|firstChapterId|newChapterId|lastChapterId)"\s*:\s*"?(\d{12,})/.exec(html);
    if (sample) {
      try {
        const page = await this.requestHTML(`${SITE_BASE}/book/${mangaId}/${sample[1]}`);
        probePage('chapter sample', page);
        probe('chapter sample data', dataOutline(page));
      } catch (e) {
        probe('chapter sample', `failed: ${(e && e.message) || e}`);
      }
    }
    throw new Error(`Webnovel: no chapter list found (${tried.join('; ')}; ${describePage(html)})`);
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const data = parseEmbeddedObject(html, 'chapInfo=');
      const info =
        (data && data.chapterInfo) ||
        findDeep(
          nextData(html),
          (o) => Array.isArray(o.contents) && o.contents.length > 0 && o.contents[0] && typeof o.contents[0] === 'object',
          12,
        );
      if (!info) {
        probePage('chapter', html);
        probe('chapter data', dataOutline(html));
        const prose = paragraphText(html);
        if (prose) return { id: chapterId, mangaId, pages: [], text: prose };
        throw new Error(`Webnovel: chapter data not found (${describePage(html)})`);
      }

      const contents = Array.isArray(info.contents) ? info.contents : [];
      const rawText = contents
        .map((p) => (p && typeof p.content === 'string' ? p.content : ''))
        .filter(Boolean)
        .join('\n\n');

      const isLocked =
        (typeof info.encryptType === 'number' && info.encryptType !== 0) ||
        (typeof info.vipStatus === 'number' && info.vipStatus !== 0) ||
        info.isAuth === 0 ||
        !rawText.trim();

      let text;
      if (!isLocked) text = plainText(rawText);
      else if (rawText.trim() && !(typeof info.encryptType === 'number' && info.encryptType !== 0)) {
        text = `${plainText(rawText)}\n\n${LOCKED_PREVIEW_NOTE}`;
      } else text = LOCKED_CHAPTER_TEXT;
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Webnovel getChapterDetails failed:', e);
      throw e;
    }
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (looksLikeCheckPage(response.data)) {
      throw { message: "Webnovel: Cloudflare's check page came back instead of the site", kind: 'challenge', origin: SITE_BASE };
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Webnovel HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
