# Build an Inkstone extension with AI (beta)

**This is in beta.** It's new, and extensions built by an AI can have bugs. Always run the test script and try the result in Boundless before you share it.

You can have an AI assistant build a Boundless Reader extension for you. Point it at this page, tell it which site you want, and it can look the site over, write the code, test it against the real thing and package it for Inkstone. Everything it needs is below.

**The quick way.** Send your AI this message (swap in your own site):

> Read https://inkstone.web.app/docs/BUILD_WITH_AI.md and follow it to build a Boundless Reader extension for https://example.com

If your AI can't open links, paste this whole file into the chat first, then add the site on the last line.

**What you do:** pick a site, let the AI work, read what it reports back, try the result in Boundless, and send it in.
**What the AI does:** everything in between.

The extensions you build load in Boundless Reader and in Sumizuri. The details below describe Boundless's runtime, so test in Boundless, and in Sumizuri too if you can.

Works with Claude, ChatGPT, Cursor, Codex, Gemini and anything else that can write code. It works best when the AI can run commands (curl, node), so it can check the real site instead of guessing.

**Why the instructions are so specific.** Every rule below comes from building and repairing real extensions in this catalog: blank screens, chapters that never loaded, covers that came back 403, lists that quietly stopped at page 5. Each rule is here because skipping it once broke a real extension.

**Prefer to approve a plan before any code is written?** Use OpenSpec instead: [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md).

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

---

# Instructions for the AI

You're building one extension for Boundless Reader: a single JavaScript file that lets the app browse, search and read one site. Work through the steps in order. Ask the user a question only when you're truly blocked.

If the user asked for OpenSpec, or this repository has an `openspec/` folder and they want a plan first, follow [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md) instead: propose a change named `add-<id>-extension`, stop for review, then apply. The steps below still apply. Step 1 becomes the findings in the proposal and design, Step 2 becomes the spec and tasks, and Steps 3 to 5 become the tasks you check off.

## What you're delivering

1. `<id>/index.js`, the extension. `<id>` is lowercase letters and numbers, like `asurascans`.
2. A `versioning.json` entry for it.
3. Test results from the live site, and a short report (the format is at the end).

## Ground rules

- **Only say what you've seen.** Every claim about how the site behaves should come from a request you actually made. If you haven't checked, you don't know yet.
- **Never invent data.** No placeholder titles, covers or chapters standing in for a real response.
- **Look again today.** What you remember about a site, or what an old comment says about it, may be out of date. Sites change their CDN rules, their APIs and their layouts. Check it now.
- **Never hand back a partial result as a whole one.** A chapter list that stopped early, or came back empty because a filter matched nothing, has to fail loudly or say what is missing.
- **Be gentle with the site.** Send a handful of requests, not hundreds. If it starts answering 429, slow down.
- **Public content only.** Don't work around paywalls or DRM, and don't try to solve CAPTCHAs. A reader signing in with their own account is fine as an optional setting (see Accounts below), but never ask the user for their password in the chat and never create an account.
- **Rate it honestly.** Set `contentRating` from what the site really serves, not from its name.
- **One site per extension.**
- **Keep the final file free of comments.** Put your notes in your report instead.
- **Stop early if it can't work.** A short "this isn't feasible, here's why" beats a half-working extension.
- **Say what you couldn't test.** Anything you only checked against a mock, or in a browser tab instead of the app, goes in your report as untested.

## Step 1: Look at the site first

Do these checks in one batch (one script, or a few curl calls sent together), then read the output once. Write down what you found.

1. **Find the real domain.** `curl -sIL https://site` and follow every redirect. Build against the domain that actually serves the content, so the extension doesn't pay for a redirect on every request. If the name no longer resolves at all (`curl: Could not resolve host`), the site has probably moved: find its new address and confirm it is the same site before you build, because the API usually changes with the move (Kagane left `kagane.to` for `kagane.org` and renamed fields at the same time).
2. **Check for bot protection.** With a normal browser User-Agent, request the homepage, a search page, a title page and a chapter page.
   - A Cloudflare "Just a moment..." page or a `cf-mitigated` header is fine. Boundless solves those in a hidden browser view (and asks the user to tap if it has to), so the extension doesn't have to.
   - If curl fails before any HTTP response arrives (a TLS error like `alert access denied`), the site is rejecting non-browser clients outright. Treat that as a no-go and say so.
   - Fire five requests at once at one endpoint. If you see 429s, add a `rateLimit` (see Step 2).
   - A limit can also hide behind a 503 or a page that says "Connection limit reached". Dynasty Scans let 16 requests through, then refused the next, then let about 1.3 a second pass; it only showed up when 40 requests ran one after another, and a retry inside the extension made the deep-check tool miss it. Measure with a longer run (40 requests, at two or three different paces) and say which pace passed.
   - A page that asks the reader to solve something (a sum, a password box, "verify you are human") is a gate, not a bug. Do not script around it: report the chapter as locked (a 403 with a short message in the error) and say so in the description. Bun Manga locks its newest four chapters of every title this way.
3. **Look for a JSON API.** Many sites fetch their data from an API. Check the page source for `__NEXT_DATA__`, `__NUXT__` or hydration props (`astro-island` tags), search the site's JavaScript files for `/api/`, or watch the network calls in a real browser. Note whether the page uses `fetch` or `XMLHttpRequest`. A JSON API is far more stable than scraping markup. Check that a field you will read is a real name: a site can scramble the field names of the data it fetches in the browser (`dg`, `Cu`, `vl` for `items`, `id`, `name`) while its server-rendered pages keep the plain ones, and the scrambled names can change on any deploy. If you see that, read values by what they are instead (a chapter's own link carries its id and number, a list is the property holding an array of objects, a rating is one of a few known words) and check the result against the plain data on a few hundred items.
4. **Sample widely.** Walk details, then the chapter list, then at least two chapters, for 3 to 5 different titles: a brand new one, an old one, different genres. This is the most valuable check there is. It catches sites that run two different reader layouts, and titles that are listed and searchable but have no chapters at all. Include a title that shows no chapters in your language: ask the API what that title does have (other languages, other sections) before you decide the request is wrong. Also find a fractional chapter (12.5, 219.5; scan the whole catalog for non-integers, a few titles have them) and open it: a site that addresses a chapter by its number can answer "219-5" or "219_5" with chapter 219 and no error, so compare the chapter you got with the one you asked for.
5. **Check ids are stable.** Note the id or slug of a few titles. If they carry a date or a long random suffix, fetch the listing again a few minutes later and compare. If the ids change, the extension has to cope with that.
6. **Read the raw HTML for each field.** Is the author plain text, or wrapped in a link or a span? A real HTML parser handles nesting, a regex quietly returns nothing.
7. **Check the images.** Fetch a page image three ways: with no `Referer`, with `Referer` set to the site, and with an unrelated one. Sites differ, and the rule can flip: one image CDN went from needing the site's `Referer` to rejecting any `Referer` at all. If the results differ, return the `referer` that works, or none. Then actually look at a downloaded image. If it's a jumble of tiles, that's image scrambling the extension can't undo, so list it as a limitation. Boundless draws JPEG, PNG, GIF, WebP and BMP, not AVIF, HEIC or JXL. Cover size matters as well: Browse shows dozens at once, so if a cover is over about 300 KB and the site offers a thumbnail size, use it.
8. **Check the encoding.** Look at real output for any site with accents or Chinese, Japanese or Korean text. A response with no charset is read as Latin-1, so UTF-8 text arrives as mojibake (`Ã©` instead of `é`). If you see it, repair it with the snippet in Step 2, or look for a mobile or app API that serves clean JSON.
9. **Check the edges of pagination.** What does an empty search do? What does one page past the end do: an error, an empty list, or page 1 again?
10. **Check that each parameter really does something.** Send the request with and without it and compare. Typical traps: a search word sent under the wrong name is ignored (`q=` where the site wants `search=`, so search seems to do nothing), `sort=title` can run Z to A unless you also give an order, several genres can mean AND rather than OR, and a `page=` is ignored in favor of `offset=`, and a page size over the maximum is clamped without a word (a chapter list asked for 2000 at a time came back 100 at a time).
11. **Find how the site lists titles.** Watch how the homepage fills its latest, popular and new lists, and note the sort parameters. Every extension needs at least one feed that works with no search word.
12. **Look at the locked chapters.** Count them across the whole catalog, not one title. Are they paid, on a timer, or for signed-in readers only? What does an anonymous request for one return: an empty page, a preview, an error page?
13. **Look for a second catalog.** A site that adds novels, volumes or another language often has separate routes for them, with their own parameters and ids that can collide with the first catalog. The obvious-looking route can be a stub that ignores its parameters, so use the one the page itself calls.
14. **Start from the reference extensions** in [github.com/realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions). Copy their structure:

| Reference | What it shows |
| --- | --- |
| `asurascans` | Comics and novels from one JSON API: feeds, genres, search, details, chapters, locked chapters and an optional sign-in |
| `chikari` | One site serving both comics and novels from a JSON API: it honors the `medium` toggle and returns text chapters for novels |
| `mangadex` | A public JSON API with settings (chapter language, data saver) and a fallback when a title has nothing in your language |
| `mangatoon` | HTML and embedded JSON, paid episodes marked locked, an optional email sign-in |
| `navercomic` | Server-rendered pages, an age wall, and an optional login with session cookies |
| `mangafire` | A site that needs the web view: one page visit per title, shared by details and chapters (not yet timed inside the app) |

`asurascans`, `chikari` and `mangadex` read from a JSON API. For a site that only serves HTML, follow the `cheerio` guidance in Step 2 and look at `mangatoon`. Other extensions in the repo are fine for ideas, but some have rough edges, so don't copy them blindly.

**Decide go or no-go.** A TLS-level block, or a whole catalog behind a login, is a real "no". Say so plainly and stop. A login that only opens extra chapters is not: see Accounts in Step 2.

## Step 2: Write the extension

### The environment

The code runs in JavaScriptCore inside the app, not a browser. You get modern JavaScript (`Promise`, `async/await`, `JSON`, `Math`, `Date`, `RegExp`, `Intl`, `encodeURIComponent`) plus three things Boundless provides: the `App` object, a `cheerio` global and a `CryptoJS` global.

There is **no** `fetch`, `XMLHttpRequest`, `URL`, `URLSearchParams`, `setTimeout`, `setInterval`, `btoa`, `atob`, `TextDecoder`, `document` or `DOMParser`. Using one throws a `ReferenceError`, and in the app that just looks like an empty screen. Don't `require` anything either.

- Parse HTML with `cheerio.load(html)`. It's cheerio's slim build with the usual jQuery-style API (`$('.title').text()`, `.attr('href')`, `.each()`). Prefer it to regex. Being the slim build, `cheerio.load(fragment)` does not wrap a fragment in `<html><body>` like the full build does, so the test script uses `cheerio/slim` to match.
- `CryptoJS` is the crypto-js library, for sites that encrypt or hash values in their pages.
- Build query strings with this helper (copy it):

```js
function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}
```

### The `App` object

| Call | What it does |
| --- | --- |
| `App.createRequestManager({ rateLimit })` | Returns a manager with `schedule(request)`. All network access goes through it. `rateLimit` is optional: `{ requestsPerSecond, requestsPerMinute }`, and the stricter one wins. |
| `App.createRequest({ url, method, headers, body })` | Describes a request. `method` defaults to `GET`. For a JSON `POST`, set `body` to a string and add a `Content-Type` header. |
| `manager.schedule(request)` | Resolves to `{ status, headers, data }`. `data` is always a **string**, so `JSON.parse` it yourself. A 404 or 500 still resolves, so check `status`. Only network failures reject. |
| `App.getSourceSetting(key)` | Reads a value the user set in your extension's settings. Always a string, or `undefined`. |
| `App.createSourceStateManager()` | Returns `{ store(key, value), retrieve(key) }`, both async, for remembering things between calls. |
| `App.base64Encode(text)` / `App.base64Decode(text)` | Base64 in and out. |
| `App.executeInWebView({ url \| html + baseUrl, script, timeoutMs })` | Last resort. Runs your `script` inside a real browser view, for sites that only hand out a token through their own page scripts. It resolves to `{ value }` or `{ error }`. Read "When the site needs the web view" below first, because it is easy to make slow or flaky. |

A request helper to start from:

```js
async requestJSON(url) {
  const manager = App.createRequestManager({});
  const response = await manager.schedule(
    App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }),
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return JSON.parse(response.data);
}
```

### The `Source` class

Export it at the very end of the file: `module.exports = { Source };`

**Required methods**

| Method | Returns |
| --- | --- |
| `async getSearchResults(request, metadata)` | `{ results: [PartialManga], metadata }` |
| `async getMangaDetails(mangaId)` | `{ mangaInfo: {...} }` |
| `async getChapters(mangaId)` | `[Chapter]` |
| `async getChapterDetails(mangaId, chapterId)` | `{ id, mangaId, pages: [url] }` |

**Optional methods**

| Method | Returns |
| --- | --- |
| `getSourceFeeds()` | `[{ id, name }]`, the Browse tabs. **Not async**: no `await`, no network. Leave it out for a single "Popular" feed. |
| `async getSearchTags()` | `[{ id, label }]`, the site's genres. Boundless matches a title's genre names against these labels to find related titles, so keep the labels the same as the names in your titles' `tags`. Return a flat list (not grouped sections), or `[]` if the site has no working genre filter. |

`getSearchResults` powers both Browse and Search:

```js
request = {
  title: 'search text',          // '' when browsing
  feed: 'popular',               // a getSourceFeeds() id (browse only)
  includedTags: [{ id: 'action' }],
  excludedTags: [],
  medium: 'comics' | 'novel',    // only if the user set the medium toggle
}
metadata = null                  // first page
metadata = { page: 2 }           // whatever you returned last time
```

Return `metadata: { page: n + 1 }` when there's another page and `undefined` when there isn't. A metadata that's always truthy makes Browse load the last page forever.

### Field names the app reads

A wrong field *name* never throws. The field just shows up blank, which is harder to debug than a crash. A wrong *type* does throw: the app casts `name`, `author`, `group`, `volume` and `text` to strings and `number`, `time` and `ageRating` to numbers, so `volume: 3` or `number: '12'` makes the whole list or screen fail instead of showing a blank.

```js
// Title in Browse and Search (PartialManga)
{
  mangaId: 'slug',        // required
  title: 'Title',
  image: 'https://...',   // "image", NOT "coverURL". Absolute URL.
  referer: 'https://site.com/',   // only if covers 403 without it
  author, summary, tags: ['Action'], webURL,
  medium: 'comics' | 'novel',
  ageRating: 0 | 16 | 18,   // minimum age, only if the site rates titles one by one
  rating, views, chapters, completed, releaseDate, publisher,
}

// getMangaDetails
{ mangaInfo: { /* same fields */, desc: '...', status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' } }

// Chapter
{
  id: 'chapter-id',       // required
  name: 'Chapter 12',     // a string. Some chapters have no title, so build it
  number: 12,             // a number, used for sorting
  group: 'scanlator',     // a string
  volume: '3',            // a string, optional, shown as "Vol. 3". Only if the site says which volume
  time: 1755731400000,    // epoch MILLISECONDS, not a Date
}

// getChapterDetails: comics
{ id, mangaId, pages: ['https://...'], referer: 'https://site.com' }   // referer only if needed

// getChapterDetails: novels
{ id, mangaId, pages: [], text: 'Chapter text' }   // or text: ['paragraph', 'paragraph']
```

It's `desc` (or `summary`), not `description`, and `status` must be one of those exact uppercase words.

**Volumes (optional).** A source that can list a title's volumes returns `volumesId` in the details: any id of its own choosing for the title's volumes edition (MangaFire uses the title's id plus `~volumes`, a suffix that is safe in URLs and never part of a real id). The app then shows a Chapters / Volumes switch. Volumes lists `getChapters(volumesId)` and reads a volume with `getChapterDetails(volumesId, volumeId)`, so the volumes are a second series as far as the extension is concerned, and their progress, history, downloads and read marks are kept apart from the chapters' (they would otherwise be mixed: Continue picks the furthest chapter number). Each volume is a chapter-shaped entry (`id`, `name` such as `Volume 3`, `number`, and a `group` line such as `9 chapters`). It must be a string id. Leave it out when the title has no volumes. Apps without the switch ignore it.

`ageRating` is a number, the title's own minimum age, and only for sites that rate titles one by one (safe is 0, suggestive 16, erotica and pornographic 18). By default Boundless blurs 16 and up and hides 18 and up, and the reader can change that. A word like `contentRating: 'adult'` on a title is ignored. The `contentRating` in `versioning.json` is a separate thing that rates the whole extension.

### Settings (only if you need them)

If your extension has options (a language, a quality setting, a server URL), declare them as `settingsSchema` in its `versioning.json` entry. Each field has a `type` (`text`, `toggle`, `select`, `multiSelect` or `section`), a `key`, a `label`, and optionally `default`, `placeholder`, `secure` (hides passwords) and `options: [{ value, label }]`. Read the value back with `App.getSourceSetting('key')`, which gives you a string (so a toggle is `'true'` or `'false'`), or `undefined` when the reader never set it.

```json
"settingsSchema": [
  { "type": "select", "key": "language", "label": "Chapter language", "default": "en",
    "options": [{ "value": "en", "label": "English" }, { "value": "all", "label": "All languages" }] },
  { "type": "toggle", "key": "dataSaver", "label": "Data saver", "default": false }
]
```

If the site has its own content or language preferences, offer them as settings and send them the way the site does (read the site's own request to see the names and values): `kagane` has a content rating of Safe, 15+ or 18+ and a preferred chapter language, which become `age_rating` and `content_lang` in its search, and a default that keeps what the extension did before. A setting your code reads but the schema doesn't declare can never be changed: one extension read a language setting for months, and nobody could set it. A few published extensions do declare one (`mangadex`, `kagane`, `asurascans`, `mangatoon`, `navercomic`), so copy their shape. The fields only appear inside the app, so look at the settings screen there.

### Rules that keep an extension stable

These are the mistakes that broke real extensions. Check your code against each one.

**Lists, errors and paging**

- Return the **whole** chapter list. Many APIs stop at 100 unless you ask for more, and a pager can have pages you never walked. Compare your count with the total the site itself shows.
- **Throw when something fails. Don't return `[]` to hide it.** Boundless remembers how many chapters a saved title had and counts any rise as new chapters. A list that came back short (a failed page, a filter that matched nothing) gets remembered, and the next complete list then arrives as dozens of "new" chapters. An error is skipped and tried again later. Return `[]` only when the title really has no chapters, and call `console.error` with the reason before you rethrow.
- A search with no match returns `{ results: [] }` and no `metadata`. Some sites answer a no-match search with a 404 page: that is "no results", not an error.
- Page 2 of Browse must really differ from page 1. Plenty of APIs accept a `page=` parameter and quietly ignore it.
- Check that each feed in `getSourceFeeds()` actually reorders the results. A 200 doesn't prove a `sort=` value did anything.
- If the site repeats a chapter across the pages of its own list, list it once.

**Data shapes**

- Build every field the way the app casts it: strings for `name`, `author`, `group`, `volume` and `text`, numbers for `number`, `time` and `ageRating`. Real data is messy. One site had hundreds of chapters with `title: null`, so build the name as `title ? 'Chapter ' + n + ' - ' + title : 'Chapter ' + n`.
- Only set `volume` when the site says which volume a chapter belongs to. Don't work it out from the order.
- Cover and page image URLs must be absolute. Resolve relative ones against the site.
- Ids must survive a round trip through your own code, so don't rely on state from an earlier call. **Don't change how ids are built in an update**: saved library entries and reading history are keyed by them. If a second catalog on the same site collides with the first (novels and comics shared 21 slugs), prefix the new ids only (`novel:the-slug`) and leave the old ones alone.
- `ageRating` is a number, and `undefined` when the site doesn't say. Don't guess "safe". A rating word you don't recognise should count as 16.

**Speed**

- Boundless opens a title by asking for its details and its chapters at the same moment. If both come from the same page or request, fetch it once: keep the pending promise in a `Map` keyed by id for a few minutes, and delete the entry if it fails.
- When the site pages its chapters, read the first page for the total, then fetch the remaining pages together with `Promise.all`, not one after another.
- No `rateLimit`, and no waiting, unless the site really pushed back with a 429 or a "connection limit" 503. A fixed delay for something you could detect is a bug. There is no timer to sleep with, so a request that was refused is sent again through the same manager: its declared spacing is the pause. The test script spaces requests by your declared `rateLimit` the way the app does, so run it after you add one.

**Language and region**

- If the site filters by language, don't show "No chapters yet" for a title that has chapters in another language (one MangaDex title had 11, all Portuguese). Offer a `select` setting with an "All languages" option, and when the wanted language has nothing, fall back to the language the title does have and name it on each chapter. Ask the API what a title has (a list of languages, or a count per language) instead of guessing.

**Redirects and text**

- Boundless doesn't follow a `POST` answered with a 301 or 302 (only a 303). Read the `Location` header and follow it yourself.
- A response with no charset is read as Latin-1, so UTF-8 text such as `é` arrives as `Ã©`. Repair it when you see that:

```js
function fixUtf8(text) {
  if (typeof text !== 'string' || !/[Â-ô][\u0080-¿]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}
```

### Locked, paid and early-access chapters

List every chapter, locked ones too, so the reader sees the real count. Mark each locked one with a short suffix on its name:

- **Timed early access** (free after a delay): end the name with `(Locked, unlocks in 5h 3m)`. The app understands exactly this shape (`Xh Ym`, `Xh`, `Ym` or `moments`) and shows a lock icon with a countdown instead. Work the time out from the site's own unlock date each time you build the list.
- **Paid, or locked any other way**: add a plain suffix such as `(Locked, Coins)` or `(Locked, 100 shards)`. The app shows it as ordinary text.

Read the whole catalog before you choose. On one site the comics had a 6 hour timer while every locked novel chapter was paid with no timer, so a countdown would have been wrong for half of it. When a locked chapter is opened, return what the site really serves: the free preview pages or an empty `pages: []` for comics, and for novels `pages: []` with a `text` that says why it's locked and how to read it, never a blank chapter. Don't hide locked chapters and don't invent an unlock.

### Accounts (optional)

Some sites open more chapters to a signed-in or paying reader. An extension can offer that as an optional setting. The reader signs in with their own account, and you never handle anyone else's.

- With no account set, behave exactly as before. If signing in fails, fall back to that, and say why where the reader will see it (for a novel, the text of the locked chapter works).
- Declare the fields in `settingsSchema` (`secure: true` hides a password). Never put credentials in the code, and never log a password or a token.
- Find the exact sign-in calls in the site's own login page script instead of guessing them. Keep the token with `App.createSourceStateManager()`, reuse it for a few hours, and renew it once when a request is refused. Put a ceiling on every retry (one sign-in attempt a minute, say), so a site that never signs you in can't cause a loop. List the login host in `hosts` as well.
- If the site's sign-in is built to resist scripts (an encrypted password, captchas, security emails, device checks), don't script it, because that can lock the reader's account. Take the session cookies from a browser the reader is already signed in with, as `secure` settings, and send them only to that site.
- Content that only a login opens keeps its rating (a 19+ title is `ageRating: 18`).
- Never ask the user for a password or a cookie in the chat. You can't test a signed-in path without an account, so test it against a mock server, and write "not tested with a real account" in your report and in the `description`.

`asurascans` and `mangatoon` sign in with an email and password, and `navercomic` uses session cookies.

### When the site needs the web view

`App.executeInWebView` is the last resort, for a site whose requests carry a token that only its own page scripts can make. These are the hardest extensions to get right, and they usually go wrong by being slow or flaky. What to know:

- Boundless runs web view calls **one at a time** for the whole app, and each one is a full page load. Two calls per title (details, then chapters) cost two page loads in a queue. Make **one visit** that returns everything the screen needs (for example the details URL and every chapter page URL), remember it per title for a few minutes, and share it between `getMangaDetails` and `getChapters`. A signed URL can usually be replayed outside the page, so fetch the actual data with a plain request. Check that it really can be.
- Your script gets three helpers: `__reportResult(value)`, `__reportError(message)` and `__fetchJSON(url, options)`, which throws `Error('HTTP ' + status)` on a non-2xx answer. End every path of your script with one of the two report functions. The call resolves to `{ value }` or `{ error }` and never throws, so check `'error' in result`.
- The script runs once the page has loaded. A site that makes its requests while the page starts has already made them (set `runBeforePageScripts: true` to inject earlier). Many sites use `XMLHttpRequest` rather than `fetch`, so wrapping `window.fetch` alone sees nothing. Read the page's own list of requests instead: `performance.getEntriesByType('resource')` holds every one, from before your script ran.
- Timers get slow in a view nobody is looking at: in a hidden browser tab, a walk that took 0.3 seconds took 17. Poll with a `MessageChannel` tick for the first quarter second, then a short timer. In a test web view with no window, timers can stop altogether after a few seconds (a 500 ms interval stopped after 7 s), so wait for things with events (a wrapped `fetch`, a `MutationObserver` for a button that appears) and work out "how long has it been" from `Date.now()`, never by counting timer ticks.
- A site that puts an age prompt in front of a reader needs the prompt cleared before it sends the page list. Find out what the button does before you press it for the reader, say in your report that the extension presses it (the app's own content settings already hide or blur 18+ titles), and do not press it yourself while testing unless the user said to.
- To walk a list through the site's own pager, click its page number yourself, one click per page, and count the pages yourself. Several clicks in the same moment collapse into one request, and the pager marks a page active only after it redraws, which lags on a phone, so don't read that back. Read the total from the first page of results so you know when to stop and which page you missed.
- If the visit missed pages, repeat it once, then throw. Never return a short list.
- The most reliable way to make a web view source fast is to need the page less. Check whether the token the site's scripts put on a request is a fixed function of the URL: load the same page twice (or a day apart) and compare the tokens, and replay a day-old URL with a plain request. One site's tokens were identical a day apart, so every URL its page produced is remembered with `App.createSourceStateManager()` (as one capped list per kind, so storage cannot grow without limit) and replayed with a plain request next time: a title opened again after a relaunch took 84 ms instead of 3 seconds, and a chapter read before 30 ms. Anything remembered that stops working is dropped and found the slow way once. A token that does depend on time or a session cannot be remembered this way.
- Start the script from the page's first moment (`runBeforePageScripts: true`) when the site makes its requests as the page starts: the call then ends when the site has made them, not after every image and ad has loaded (0.7 s against 1.3 s in WebKit with a cold cache). Give that early attempt a long enough runner timeout for a long walk, and a short wait inside the script for "the page never made its request", then try once more the usual way (a security check page is only waited out for scripts that run after load).
- Walk a site's pager one page at a time: click, wait for that page's RESPONSE, then click the next. Moving on as soon as a request was seen raced ahead of the pager and stalled in WebKit, and clicking every visible number in a burst made the site reset its pager to page 1 and freeze. The site can also rebuild its pager from page 1 while it is still starting (seen in 2 of 25 runs), so read the pager again at every step, click the nearest number below the one you want if it is not shown, and cap both the steps and the total time. Compare the pages you collected with `meta.lastPage`.
- A browser tab is not the app's engine. A walk that was clean in a Chromium tab stalled in WebKit, which is what the app uses on iPhone and Mac. On a Mac, a small Swift program with a `WKWebView` (the helper shim defined, the script installed at document start, a fresh non-persistent data store for a cold cache) runs the exact script in that engine: run it 20 to 40 times, because failures that happen one time in ten only show up that way.
- Test the exact script in a real browser tab first: open the page, wait about 2.5 seconds, define stand-ins for the three helpers, evaluate the script text, and check the result against the site's own totals. The test script can't run web view code, so say in your report which engine you tested it in and that it was not tested inside the app.
- A site behind a Cloudflare check can be served **entirely** by the web view. When the app's own HTTP client cannot reuse the site's clearance, Boundless answers every plain request for that site by loading the URL in its hidden web view and returning the page's HTML with status 200. A page of HTML reads the same either way, but a JSON endpoint comes back as `<html><head>...</head><body><pre>{...}</pre></body></html>`, so a bare `JSON.parse` fails with "unexpected token '<'" (seen on a phone: the chapter list of a novel site failed after three attempts and 70 seconds, because each attempt was a whole web view load, one at a time for the app). If the body starts with `<`, read the JSON out of the `<pre>` and remember that this site is in this mode. A plain curl or Node request to such a site gets a 403, so the test script cannot reach it: say so in your report. For a list that needs many requests, run ONE `executeInWebView` visit whose script fetches every page from inside the site's own page (same origin, so no clearance problem, and real timers for pacing and retrying a 429), and send the rows back in one result. Keep the plain one-request-per-page path as a fallback if the visit fails.
- A web view script is usually built inside a JavaScript template literal, and a template literal swallows backslash escapes: a `\s` or `\d` in your script reaches the page as `s` or `d`, so a regex silently matches the wrong thing (here it would have rewritten every `s` in the chapter names). Print the generated script and read it, or avoid escapes in the page code and tidy the data on the extension side.
- A site where every page image needs its own request can return the text `boundless-lazy-page` for each page, and answer `getPageData(mangaId, chapterId, pageIndex)` with `{ uri, referer, headers }` for a URL, `{ base64, mimeType }` for the image itself, or `{ error }`. No published extension uses it right now (one did until its page images turned out to be plain URLs again, with no Referer).

## Step 3: Test it on the real site

Run the test script. It does two jobs: it checks the extension is **compatible** with Boundless (loads in a bare sandbox, exports the right methods, has a valid `versioning.json` entry, matching `sha256`), and it checks the extension can **fetch real results** (browse, search, details, chapters and actually opening chapters, for two titles). The full guide is in [TESTING.md](https://inkstone.web.app/docs/TESTING.md).

Save this as `test-extension.mjs` next to your extension folder (or download it from https://inkstone.web.app/docs/test-extension.mjs):

<!-- test-extension:start -->

```js
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as cheerio from 'cheerio/slim';

const [file, searchTerm] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node test-extension.mjs <path/to/index.js> [search term]');
  process.exit(1);
}

const tally = { pass: 0, fail: 0, warn: 0 };
const say = (kind, label, detail = '') => {
  tally[kind]++;
  console.log(`${kind.toUpperCase().padEnd(4)}  ${label}${detail ? `  (${detail})` : ''}`);
  return kind === 'pass';
};
const check = (ok, label, detail) => say(ok ? 'pass' : 'fail', label, detail);
let warnedRating = false;
const warnIgnoredRating = (what) => {
  if (warnedRating) return;
  warnedRating = true;
  say('warn', `${what} set contentRating, which Boundless ignores`, 'to rate titles one by one, set ageRating to a minimum age such as 0, 16 or 18');
};
let skippedInApp = false;
const finish = () => {
  console.log(`\n${tally.pass} passed, ${tally.fail} failed, ${tally.warn} warnings.`);
  if (tally.fail) console.log('Not ready yet.');
  else if (skippedInApp) console.log('No problems found. The parts that need Boundless were skipped, so try those in the app.');
  else console.log('Compatible, and it fetches real results.');
  process.exit(tally.fail ? 1 : 0);
};
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
const pickQuery = (title) => {
  const parts = String(title ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => [...w].length >= 3);
  const first = parts[0] ?? String(title ?? '').trim();
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(first) ? [...first].slice(0, 4).join('') : first;
};
const gated = (chapter) => /\b(locked|paid|premium|join to read|early access|coins?)\b/i.test(chapter.name ?? '');

const requests = [];
const App = {
  createRequestManager: (options = {}) => {
    // Boundless spaces a manager's requests by its declared rateLimit (the stricter of
    // requestsPerSecond and requestsPerMinute), so the test does the same.
    const limit = options.rateLimit ?? {};
    const gaps = [limit.requestsPerSecond > 0 ? 1000 / limit.requestsPerSecond : 0, limit.requestsPerMinute > 0 ? 60000 / limit.requestsPerMinute : 0];
    const gap = Math.max(...gaps);
    let nextSlot = 0;
    return {
    async schedule(request) {
      if (gap > 0) {
        const wait = Math.max(0, nextSlot - Date.now());
        nextSlot = Math.max(nextSlot, Date.now()) + gap;
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      requests.push(new URL(request.url).hostname);
      let res;
      try {
        res = await fetch(request.url, {
          method: request.method || 'GET',
          headers: request.headers,
          body: request.body,
        });
      } catch (error) {
        throw new Error(`network error: ${error.cause?.code ?? error.cause?.message ?? error.message}`);
      }
      return { status: res.status, headers: Object.fromEntries(res.headers), data: await res.text() };
    },
    };
  },
  createRequest: (options) => options,
  getSourceSetting: () => undefined,
  createSourceStateManager: () => {
    const saved = new Map();
    return { store: async (k, v) => void saved.set(k, v), retrieve: async (k) => saved.get(k) };
  },
  base64Encode: (s) => Buffer.from(s).toString('base64'),
  base64Decode: (s) => Buffer.from(s, 'base64').toString(),
  executeInWebView: async () => {
    throw new Error('App.executeInWebView only works inside Boundless. Test that part in the app.');
  },
};

const code = readFileSync(file, 'utf8');

console.log('Compatibility (no network)\n');

const banned = ['fetch', 'XMLHttpRequest', 'URL', 'URLSearchParams', 'setTimeout', 'setInterval', 'btoa', 'atob', 'TextDecoder', 'document', 'DOMParser', 'structuredClone', 'require'];
const hits = [];
code.split('\n').forEach((line, i) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  for (const name of banned) {
    if (new RegExp(`(^|[^\\w.$])${name}\\s*[(.]|new ${name}\\b`).test(line)) hits.push(`${name} on line ${i + 1}`);
  }
});
if (hits.length) {
  say('warn', 'uses something Boundless does not provide', `${hits.slice(0, 4).join(', ')}. Fine inside a string for a WebView script, a bug anywhere else`);
} else {
  say('pass', 'no fetch, URL, setTimeout, document or require in the code');
}
const usesWebView = code.includes('executeInWebView');
if (usesWebView) {
  say('warn', 'uses App.executeInWebView, which only runs inside Boundless. Test that part in the app');
}

let CryptoJS;
try {
  CryptoJS = (await import('crypto-js')).default;
} catch {
  CryptoJS = undefined;
}
const sandbox = { module: { exports: {} }, App, cheerio, ...(CryptoJS ? { CryptoJS } : {}), console };
sandbox.exports = sandbox.module.exports;
try {
  vm.runInNewContext(code, sandbox, { filename: file });
  say('pass', 'loads without errors in a bare Boundless-style sandbox');
} catch (error) {
  check(false, 'loads without errors in a bare Boundless-style sandbox', error.message);
  finish();
}
const Source = sandbox.module.exports.Source;
if (!check(typeof Source === 'function', 'exports a Source class', 'module.exports = { Source }')) finish();
const source = new Source();

const anime = typeof source.getVideos === 'function';
for (const method of ['getSearchResults', 'getMangaDetails', 'getChapters', anime ? 'getVideos' : 'getChapterDetails']) {
  check(typeof source[method] === 'function', `has ${method}()`);
}

let feeds = [];
if (typeof source.getSourceFeeds === 'function') {
  const returned = source.getSourceFeeds();
  check(!(returned && typeof returned.then === 'function'), 'getSourceFeeds() is synchronous, not async');
  feeds = Array.isArray(returned) ? returned : [];
  check(feeds.every((f) => f.name && f.id !== undefined && f.id !== null), 'every feed has an id and a name', `${feeds.length} feeds`);
  if (feeds.some((f) => f.id === '')) say('warn', 'a feed has an empty id', 'it can work as the default feed, but a named id is safer');
}

const folder = path.resolve(path.dirname(file));
const listPath = [path.dirname(folder), path.dirname(path.dirname(folder))].map((dir) => path.join(dir, 'versioning.json')).find((candidate) => existsSync(candidate)) ?? path.join(path.dirname(folder), 'versioning.json');
let entry;
if (existsSync(listPath)) {
  const listing = JSON.parse(readFileSync(listPath, 'utf8'));
  entry = listing.sources?.find((s) => s.id === path.basename(folder));
  if (check(entry, 'has an entry in versioning.json', `id "${path.basename(folder)}"`)) {
    check(entry.name && /^\d+\.\d+\.\d+/.test(entry.version ?? ''), 'entry has a name and a version like 1.0.0');
    check(['comics', 'novel', 'both', 'anime'].includes(entry.medium), 'medium is comics, novel, both or anime', entry.medium);
    check((entry.medium === 'anime') === anime, 'an anime source has getVideos, and only an anime source', entry.medium);
    const typeFolder = path.basename(path.dirname(folder));
    const wantedFolder = { comics: 'comics', novel: 'novels', both: 'mixed', anime: 'anime' }[entry.medium];
    if (['comics', 'novels', 'mixed', 'anime'].includes(typeFolder)) check(typeFolder === wantedFolder, 'sits in the folder for its medium', `${typeFolder}/ holds it, ${wantedFolder}/ fits "${entry.medium}"`);
    check(['safe', 'mature', 'adult'].includes(entry.contentRating), 'contentRating is safe, mature or adult', entry.contentRating);
    check(isUrl(entry.website), 'website is a full URL');
    check(/^[a-z]{2,3}$/.test(entry.language ?? ''), 'language is a short code like en', entry.language);
    check(entry.description && entry.capabilities?.length, 'has a description and capabilities');
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (entry.sha256) check(entry.sha256 === digest, 'sha256 matches the file', entry.sha256 === digest ? '' : 'run shasum -a 256 and update it');
    else say('warn', 'no sha256 yet', `shasum -a 256 gives ${digest.slice(0, 12)}...`);
  }
} else {
  say('warn', 'no versioning.json one or two folders up, so the listing checks were skipped');
}

console.log('\nLive results (real requests to the site)\n');

const withTimeout = (promise, ms = 60000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);
async function step(label, run) {
  const started = Date.now();
  try {
    const value = await withTimeout(run());
    return { value, took: `${((Date.now() - started) / 1000).toFixed(1)}s` };
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes('only works inside Boundless')) {
      skippedInApp = true;
      say('warn', `${label} needs Boundless, so it was skipped`);
    } else {
      say('fail', label, message.slice(0, 200));
    }
    return null;
  }
}

const browse = await step('browse', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, null));
if (browse) {
  const list = browse.value.results ?? [];
  if (usesWebView && list.length === 0) say('warn', 'browse returned nothing, expected if it needs Boundless (WebView)');
  else check(list.length > 0, 'browse returns titles', `${list.length} results in ${browse.took}`);
  check(list.every((r) => r.mangaId && r.title), 'every title has a mangaId and a title');
  check(list.every((r) => isUrl(r.image)), 'every cover is an absolute URL in "image"');
  if (list.some((r) => r.contentRating !== undefined && r.ageRating === undefined)) warnIgnoredRating('titles');
  if (list.some((r) => r.ageRating !== undefined)) {
    check(list.every((r) => r.ageRating === undefined || typeof r.ageRating === 'number'), 'ageRating is a number, a minimum age such as 0, 16 or 18');
  }
  if (browse.value.metadata) {
    const next = await step('browse page 2', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, browse.value.metadata));
    if (next) check(next.value.results?.[0]?.mangaId !== list[0]?.mangaId, 'page 2 differs from page 1');
  }
}

let genreCount = null;
if (typeof source.getSearchTags === 'function') {
  const tags = await step('genre list', () => source.getSearchTags());
  if (tags) {
    genreCount = tags.value.length;
    if (genreCount === 0) say('warn', 'genre list is empty', 'fine if the site has no working genre filter, but then do not declare "genres"');
    else if (tags.value.some((t) => Array.isArray(t.tags))) say('warn', 'genre list is grouped into sections', 'Boundless reads flat { id, label } entries, so return a flat list');
    else check(tags.value.every((t) => t.id && t.label), 'genre list has ids and labels', `${genreCount} genres`);
  }
}

const query = searchTerm || pickQuery(browse?.value.results?.[0]?.title) || 'a';
const found = await step(`search "${query}"`, () => source.getSearchResults({ title: query }, null));
if (found) {
  const count = found.value.results?.length ?? 0;
  if (usesWebView && count === 0) say('warn', `search "${query}" returned nothing, expected if it needs Boundless (WebView)`);
  else check(count > 0, `search "${query}" returns titles`, `${count} results in ${found.took}`);
}

const nothing = await step('search for a word that matches nothing', () => source.getSearchResults({ title: 'zzqxkvjwpl' }, null));
if (nothing) {
  const empty = nothing.value?.results;
  check(Array.isArray(empty), 'a search that matches nothing returns a list, not an error', 'some sites answer 404 for no match: treat that as an empty list');
  if (Array.isArray(empty) && empty.length > 0) say('warn', `a nonsense search still returned ${empty.length} titles`, 'fine if the site does fuzzy matching, a bug if the query is being ignored (check the parameter name)');
}

for (const item of (found?.value.results ?? []).slice(0, 2)) {
  console.log(`\n${item.title}`);
  const details = await step('details', () => source.getMangaDetails(item.mangaId));
  if (details) {
    const info = details.value.mangaInfo;
    check(info && (info.desc !== undefined || info.summary !== undefined), 'details have a description (desc or summary)', details.took);
    check(['ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED', 'UNKNOWN'].includes(info?.status), 'status is an allowed value', info?.status);
    check([info?.title, info?.author, info?.desc, info?.summary].every((v) => v === undefined || v === null || typeof v === 'string'), 'title, author and description are plain strings', 'join several author names into one string, the app throws on a list');
    if (info && info.contentRating !== undefined && info.ageRating === undefined) warnIgnoredRating('details');
  }
  const chapters = await step('chapters', () => source.getChapters(item.mangaId));
  if (!chapters) continue;
  const list = chapters.value ?? [];
  check(list.length > 0, 'chapter list is not empty', `${list.length} chapters in ${chapters.took}`);
  check(list.every((c) => c.id), 'every chapter has an id');
  check(list.every((c) => c.time === undefined || c.time > 1e11), 'chapter times are in milliseconds');
  check(new Set(list.map((c) => String(c.id))).size === list.length, 'every chapter id is unique', 'a chapter that appears on two pages of the site should be listed once');
  const wrongType = (v, type) => v !== undefined && v !== null && typeof v !== type;
  check(
    list.every((c) => !wrongType(c.name, 'string') && !wrongType(c.group, 'string') && !wrongType(c.volume, 'string') && !wrongType(c.number, 'number') && !wrongType(c.time, 'number')),
    'chapter fields have the types Boundless casts to',
    'name, group and volume are strings; number and time are numbers, not "12"',
  );
  const tryPlay = async (chapter, label, started) => {
    const videos = await withTimeout(source.getVideos(item.mangaId, chapter.id));
    if (!Array.isArray(videos) || videos.length === 0 || !videos.every((v) => isUrl(v.url))) return { ok: false, label, detail: 'getVideos gave no video with a full URL' };
    const first = videos[0];
    const answer = await withTimeout(fetch(first.url, { headers: first.headers ?? {} }), 30000);
    const body = answer.ok ? await answer.text() : '';
    const plays = answer.ok && (body.startsWith('#EXTM3U') || (answer.headers.get('content-type') ?? '').startsWith('video/'));
    const subtitles = (first.subtitles ?? []).length;
    const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
    const skip = first.intro ? `, intro ${Math.round(first.intro.start / 1000)}s to ${Math.round(first.intro.end / 1000)}s` : '';
    return { ok: plays, label, detail: plays ? `${videos.length} video, ${subtitles} subtitle tracks${skip}, in ${took}` : `the stream answered ${answer.status}` };
  };
  const tryOpen = async (chapter) => {
    const label = `chapter "${chapter.name ?? chapter.id}"`;
    const started = Date.now();
    try {
      if (anime) return await tryPlay(chapter, label, started);
      const read = await withTimeout(source.getChapterDetails(item.mangaId, chapter.id));
      const isText = Array.isArray(read.pages) && read.pages.length === 0 && read.text;
      const isImages = read.pages?.length > 0 && read.pages.every(isUrl);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      return { ok: Boolean(isText || isImages), label, detail: isText ? 'text' : `${read.pages?.length ?? 0} pages in ${took}` };
    } catch (error) {
      const message = String(error.message ?? error);
      if (message.includes('only works inside Boundless')) return { skipped: true, label, detail: message };
      return { ok: false, label, detail: message.slice(0, 200) };
    }
  };
  const readable = list.filter((c) => !gated(c));
  if (readable.length && readable.length < list.length) say('warn', `${list.length - readable.length} locked or paid chapters were skipped`, 'timed locks should end in "(Locked, unlocks in 5h 3m)" so the app shows a countdown');
  const pool = readable.length ? readable : list;
  const attempts = [];
  for (const chapter of pool.slice(0, 4)) {
    attempts.push(await tryOpen(chapter));
    if (attempts.at(-1).ok || attempts.at(-1).skipped) break;
  }
  if (attempts.length === 0) continue;
  const [first] = attempts;
  const opened = attempts.at(-1);
  if (first.skipped) {
    skippedInApp = true;
    say('warn', 'opening a chapter needs Boundless, so it was skipped');
    continue;
  }
  if (first.ok) {
    say('pass', `${first.label} opens`, first.detail);
  } else if (opened.ok) {
    say('warn', `${first.label} did not open (${first.detail}), maybe locked or not published yet`);
    say('pass', `${opened.label} opens`, opened.detail);
  } else {
    say('fail', `none of the ${attempts.length} newest chapters opened`, `${first.label}: ${first.detail}`);
  }
  if (pool.length > 1) {
    const oldest = await tryOpen(pool.at(-1));
    check(oldest.ok, `${oldest.label} opens`, oldest.detail);
  }
}

if (entry && genreCount !== null && browse && !usesWebView) {
  const declares = entry.capabilities?.includes('genres');
  if (declares && genreCount === 0) say('fail', 'declares "genres" in versioning.json but the genre list is empty');
  if (!declares && genreCount > 0) say('warn', 'has a working genre list but versioning.json does not declare "genres"');
}

const hostsUsed = [...new Set(requests)];
console.log(`\nMade ${requests.length} requests to ${hostsUsed.join(', ') || 'nothing'}.`);
if (entry?.hosts?.length) {
  const allowed = (host) => entry.hosts.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p));
  const blocked = hostsUsed.filter((h) => !allowed(h));
  check(blocked.length === 0, 'every host it called is in "hosts"', blocked.join(', '));
} else if (entry) {
  say('warn', 'no "hosts" list declared, so nothing limits where it can connect (recommended)');
}

finish();
```

<!-- test-extension:end -->

Run it (Node 18 or newer):

```bash
npm install cheerio
node test-extension.mjs ./mysite/index.js "naruto"
```

What to do with the results:

- Keep going until there are no `FAIL` lines. Try a few different search words (the script picks one itself if you don't give it one), including one that should return nothing.
- A `fetch is not defined` (or `URL`, `setTimeout`, `document`) means the code used something the app doesn't have.
- `WARN` lines are worth reading but aren't failures. A missing `hosts` list is the usual one.
- The script checks data, not looks. Read the output yourself: do titles, covers and chapter names look like the real site? Are chapters in a sensible order?
- A site behind a Cloudflare challenge may answer `403` to plain Node even though Boundless gets through. Say that in your report.
- Anything using `App.executeInWebView` only runs inside Boundless, and the script says so.

The script checks data, so these are yours to check before you report:

- The chapter count against the number the site itself shows, for a short title and for a long one. A long title has several pages of chapters, which is where paging bugs hide.
- A title with nothing in your language, a title with no chapters, and a search that matches nothing. None of them should end in a blank error.
- One locked chapter, if the site has any: its name, and what opening it does.
- A title with a mature rating: it should blur in Boundless.
- Everything the script skipped (web view code, Cloudflare). Report it as not tested.

When it passes, try it in Boundless for real. A repository is just a folder of static files, so put `versioning.json` and your `<id>/index.js` on any static host (GitHub Pages works), add that URL in Boundless's extension settings (in Sumizuri: Browse, then Repos, then Add a repo), and install your extension.

## Step 4: Package it

Add an entry to `versioning.json`, and make the folder name equal the `id`:

```json
{
  "id": "mysite",
  "name": "My Site",
  "version": "1.0.0",
  "medium": "comics",
  "website": "https://mysite.com",
  "iconUrl": "https://mysite.com/apple-touch-icon.png",
  "description": "What it covers, which feeds it has, and anything that doesn't work.",
  "capabilities": ["browse", "search", "genres", "details", "chapters", "reader"],
  "language": "en",
  "contentRating": "safe",
  "hosts": ["mysite.com", "*.mysite-cdn.com"],
  "sha256": "<hash of index.js>"
}
```

- `medium` is `comics`, `novel` or `both`. `language` is a two-letter code. `capabilities` lists what really works.
- `contentRating` is `safe`, `mature` or `adult`, based on what you saw in Step 1. When in doubt, go one step stricter.
- `hosts` lists every host the extension talks to. Boundless refuses requests to anything else. Image hosts aren't covered by it, but list them anyway.
- `description` should say what's missing, and what you couldn't test (no real account, a browser tab instead of the app). A description that overclaims costs the next person a debugging session.
- If your code reads a setting, declare it in `settingsSchema` (see Settings above), or nobody can change it. `capabilities` only labels the listing: the app never reads it.
- `author` is optional. Add your name or handle to get credit on the catalog. `authorUrl` can link it to your profile.
- Get the hash with `shasum -a 256 mysite/index.js`. **Redo it every time the file changes.** A stale hash makes Boundless refuse the install.
- Bump `version` whenever the file changes.

## Step 5: List it on Inkstone

1. Fork [realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions).
2. Add your `<id>/index.js` folder and your `versioning.json` entry.
3. Open a pull request. Your report (below) works as the description.

No GitHub? Share the folder on the [Inkstone Discord](https://discord.gg/6pX2XgFYcs) instead. Every submission is tried against the live site before it's listed.

## Your final report

End with something the user can read in thirty seconds:

- **Site and extension id.**
- **Data source:** JSON API, HTML or embedded data, and how you found out.
- **What works:** browse feeds, search, genres, details, chapters, reading. Say which titles you tested.
- **What doesn't:** limitations, honestly. Scrambled images, a missing feed, chapters that need a login.
- **Protection:** Cloudflare, rate limits, hotlink protection, and what you did about each.
- **Locked chapters:** how many, whether they are timed or paid, and what opening one does.
- **Content rating** you chose, and why.
- **Test output** from the script.
- **Not tested:** anything you could only check against a mock or in a browser tab (sign-in, web view code, Cloudflare), so the user knows what to try in the app.
- **Files** to commit.

## Common mistakes

| Mistake | What happens |
| --- | --- |
| `coverURL` instead of `image` | Blank covers, no error |
| Relative image URLs | Covers or pages fail to load |
| `time` as a `Date`, or in seconds | Wrong or missing dates |
| `description` instead of `desc` | Blank summary |
| A `status` that isn't an allowed word | Shows as Unknown |
| Always returning `metadata` | Browse loads the last page forever |
| `getSourceFeeds()` that's `async` or fetches | Feeds never appear |
| Using `fetch`, `URL` or `setTimeout` | Empty screens |
| Chapter list capped at 100 | Missing chapters |
| Forgetting `referer` on hotlink-protected images | Chapters open but every page fails |
| A CDN that refuses the app's own (Dart) user agent, with only `referer` returned | Chapters open but every page fails, though the same URL works in curl; return `headers` with a browser `User-Agent` on pages and covers |
| Using the 110 by 150 thumbnail a WordPress grid names | Blurry covers; check whether the 175 by 238 or 350 by 476 size of the same file exists and use it |
| Rating a site safe because it prints no genres | Explicit titles in a source the reader trusts; look at the titles and blurbs of the first listing page too |
| Stale `sha256` | Install refused |
| `contentRating` guessed from the site's name | Wrong filtering for the reader |
| `getChapters` returning `[]` after an error | The title looks empty, then a burst of "new chapters" later |
| A chapter list filtered to one language | "No chapters yet" for a title that has chapters in another |
| A number where a string belongs (`volume: 3`, `name: 12`) | The whole chapter list can fail to load |
| `q=` sent where the site wants `search=` | Search quietly ignores the query |
| Locked chapters hidden, or a made-up lock format | Wrong chapter count, no lock icon |
| Two web view calls per title | Every title opens slowly |
| Wrapping only `window.fetch` in a web view script | The site's own `XMLHttpRequest` calls are never seen |
| Reading the pager's "active" page to know where you are | The walk stops early on a phone |
| Clicking the next pager number as soon as a request is seen | The walk races ahead and stalls (the site resets its pager) |
| Loading the page again for a token that never changes | Every open is a full page load, for ever |
| Testing a web view script only in a browser tab | Passes there, stalls one time in ten in WebKit |
| Calling a JSON endpoint with a plain request and a bare `JSON.parse` on a site that is served by the web view | "unexpected token '<'": the JSON arrives wrapped in a `<pre>` page and the title never opens |
| A backslash escape (`\s`, `\d`) inside the template literal that builds a web view script | The page gets `s` or `d` and the regex matches the wrong thing |
| Sending `volumesId` as a number, or a volumes id that is the title's own id | The details fail to load, or volumes mix into the chapters' history |
| A setting read in code but missing from `settingsSchema` | Nobody can change it |
| Scripting a sign-in that is built to resist scripts | Captchas, security emails, a locked account |
| Trusting an old comment or memory about a site | The wrong CDN rule or API |
| Reading a site's browser-fetched JSON by field name when the site scrambles the names | Empty lists and timeouts after a deploy, with the server-rendered pages still fine |
| Counting timer ticks to measure a timeout in a web view | Twice as long, or never, in a view that holds timers back |
| Keeping the old domain after the site moved | Every request fails at once (the name does not resolve) |
| Treating a site's old address as dead when it still resolves but answers a challenge | It may now be only a directory of mirror addresses (a real browser shows a "Mirrors" page, curl gets a 403 challenge): open it in a browser, test each listed address with curl, and have the source try them in order and stay on the one that answers |
| Changing how ids are built in an update | Saved library and history entries stop matching |
