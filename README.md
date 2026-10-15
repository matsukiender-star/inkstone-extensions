# Inkstone

**Extension Registry.** Community-made extensions that add content to Boundless Reader and Sumizuri. Free and open source under the MIT license.

Each extension is one small JavaScript file that the app downloads and runs in a sandbox on your device. The same file works in both apps.

The full catalog and docs live at [inkstone.web.app](https://inkstone.web.app). Questions or a broken extension? Come say hi on [Discord](https://discord.gg/6pX2XgFYcs).

## Add it to your app

Both apps use the same address:

```
https://inkstone.web.app/v3
```

| App | Where to paste it |
| --- | --- |
| Boundless Reader | Extension settings. Step by step guide: [inkstone.web.app/installation](https://inkstone.web.app/installation) |
| [Sumizuri](https://github.com/not-akari/sumizuri) (Android, Windows, Linux) | Browse, then Repos, then Add |

On a device with Sumizuri, a link to `sumizuri://add-repo?url=https%3A%2F%2Finkstone.web.app%2Fv3` opens Sumizuri with the address filled in, so you only tap Add.

Nothing installs until you pick an extension, and removing one takes a tap.

## What's in here

```
comics/<id>/index.js       extensions for manga, manhwa and webtoons
novels/<id>/index.js       extensions for novels
mixed/<id>/index.js        extensions that do both
anime/<id>/index.js        anime extensions, for apps that play video such as Sumizuri
versioning.json            the list the apps read
docs/BUILD_WITH_AI.md      have an AI assistant build one for you
docs/EXTENSIONS.md         how an extension works
docs/TESTING.md            check an extension works
docs/test-extension.mjs    the test script
docs/OPENSPEC.md           the spec-driven way, with OpenSpec
openspec/                  specs describing how extensions work
AGENTS.md                  instructions for AI coding assistants
```

## Build one with AI

Open this repo in Claude Code, Cursor, Codex or any coding assistant and tell it which site you want. It picks up [AGENTS.md](AGENTS.md) and follows [docs/BUILD_WITH_AI.md](docs/BUILD_WITH_AI.md). Or paste that guide into a chat.

Prefer to review a written plan before any code is written? This repo works with [OpenSpec](https://github.com/Fission-AI/OpenSpec). Run `openspec init`, then propose a change for your site. See [docs/OPENSPEC.md](docs/OPENSPEC.md).

## Extensions

96 extensions right now. Ratings are Safe, Mature or Adult, and some extensions also rate each title on its own.

Each extension lives in the folder for what it offers: `comics`, `novels`, `mixed` for those that do both, or `anime`. The site still serves every one at `inkstone.web.app/v3/<id>/index.js`, so the folders change nothing in the apps.

### Comics

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Anime-Sama](comics/animesama/index.js) | anime-sama.to | French | Mature | 1.0.1 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [BL village](comics/blvillage/index.js) | blvillage.com | Japanese | Adult | 1.1.1 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [CManga](comics/cmanga/index.js) | cmangavn.com | Vietnamese | Adult | 1.0.0 |
| [ComicFury](comics/comicfury/index.js) | comicfury.com | English | Adult | 1.0.0 |
| [Comix](comics/comix/index.js) | comix.to | English | Safe | 2.2.4 |
| [Flame Scans](comics/flamescans/index.js) | flamecomics.xyz | English | Safe | 1.0.0 |
| [GD Scans](comics/gdscans/index.js) | gdscans.com | English | Adult | 1.0.0 |
| [GlobalComix](comics/globalcomix/index.js) | globalcomix.com | English | Adult | 1.1.0 |
| [HiperDEX](comics/hiperdex/index.js) | hiperdex.tv | English | Adult | 1.0.1 |
| [HiveToons](comics/hivetoon/index.js) | hivetoons.org | English | Adult | 1.1.0 |
| [Indomanhwa](comics/indomanhwa/index.js) | indomanhwa.com | Indonesian | Mature | 1.0.0 |
| [InkStory](comics/inkstory/index.js) | inkstory.net | Russian | Mature | 1.1.0 |
| [InManga](comics/inmanga/index.js) | inmanga.com | Spanish | Safe | 1.1.0 |
| [Kagane](comics/kagane/index.js) | kagane.to | English | Safe | 1.1.0 |
| [Keikomik](comics/keikomik/index.js) | keikomik.net | Indonesian | Adult | 1.0.0 |
| [Kingofshojo](comics/kingofshojo/index.js) | kingofshojo.com | English | Adult | 1.0.0 |
| [Komikindo](comics/komikindo/index.js) | komikindo.ch | Indonesian | Adult | 1.0.0 |
| [Komiku](comics/komiku/index.js) | komiku.org | Indonesian | Adult | 1.0.0 |
| [KunManga](comics/kunmanga/index.js) | kunmanga.com | English | Adult | 1.1.0 |
| [Lectormanga](comics/lectormanga/index.js) | lectormangass.net | Spanish | Adult | 1.2.1 |
| [LelManga](comics/lelmanga/index.js) | lelmanga.com | French | Adult | 1.0.0 |
| [Lelscans](comics/lelscans/index.js) | lelscans.net | French | Safe | 1.1.0 |
| [Manga District](comics/mangadistrict/index.js) | mangadistrict.com | English | Adult | 1.0.0 |
| [Manga-Scantrad](comics/mangascantrad/index.js) | manga-scantrad.io | French | Adult | 1.0.0 |
| [MangaBuddy](comics/mangabuddy/index.js) | mangabuddy1.co.uk | English | Adult | 1.3.0 |
| [MangaDex](comics/mangadex/index.js) | mangadex.org | English | Safe | 1.2.0 |
| [MangaFire](comics/mangafire/index.js) | mangafire.to | English | Safe | 1.4.1 |
| [MangaFreak](comics/mangafreak/index.js) | mangafreak.me | English | Adult | 1.0.1 |
| [MangaGo](comics/mangago/index.js) | mangago.me | English | Adult | 1.1.0 |
| [MangaHere](comics/mangahere/index.js) | mangahere.cc | English | Adult | 1.1.0 |
| [MangaHub](comics/mangahub/index.js) | mangahub.io | English | Adult | 1.0.0 |
| [Mangakakalot](comics/mangakakalot/index.js) | mangakakalot.gg | English | Adult | 1.2.0 |
| [MangaKatana](comics/mangakatana/index.js) | mangakatana.com | English | Adult | 1.1.3 |
| [MangaOwl](comics/mangaowl/index.js) | mangaowl.io | English | Adult | 1.0.0 |
| [Mangapill](comics/mangapill/index.js) | mangapill.com | English | Adult | 1.0.0 |
| [MangaPlaza](comics/mangaplaza/index.js) | mangaplaza.com | English | Adult | 1.1.1 |
| [MangaRead](comics/mangaread/index.js) | mangaread.org | English | Adult | 1.0.1 |
| [MangaToon](comics/mangatoon/index.js) | mangatoon.mobi | English | Mature | 1.2.0 |
| [MangaTown](comics/mangatown/index.js) | mangatown.com | English | Adult | 1.2.0 |
| [ManhuaFast](comics/manhuafast/index.js) | manhuafast.net | English | Mature | 1.0.0 |
| [Manhuagui](comics/manhuagui/index.js) | m.manhuagui.com | Chinese | Adult | 1.0.1 |
| [ManhuaHot](comics/manhuahot/index.js) | manhuahot.com | English | Mature | 1.0.0 |
| [Manhuaplus](comics/manhuaplus/index.js) | manhuaplus.org | English | Safe | 1.0.0 |
| [Manhuaus](comics/manhuaus/index.js) | manhuaus.club | English | Mature | 1.0.0 |
| [ManhuaVN](comics/manhuavn/index.js) | manhuavn.top | Vietnamese | Adult | 1.2.0 |
| [Manhwa18](comics/manhwa18/index.js) | manhwa18.cc | English | Adult | 1.0.0 |
| [ManhwaClan](comics/manhwaclan/index.js) | manhwaclan.com | English | Adult | 1.0.0 |
| [ManhwaHQ](comics/manhwahq/index.js) | manhwahq.com | English | Adult | 1.0.1 |
| [ManhwaTop](comics/manhwatop/index.js) | manhwatop.com | English | Adult | 1.0.0 |
| [MGeko](comics/mgeko/index.js) | mgeko.cc | English | Safe | 1.0.0 |
| [Natomanga](comics/natomanga/index.js) | natomanga.com | English | Adult | 1.2.0 |
| [Naver Webtoon](comics/navercomic/index.js) | comic.naver.com | Korean | Mature | 1.2.0 |
| [NetTruyen](comics/nettruyen/index.js) | nettruyenvia.com | Vietnamese | Adult | 1.0.0 |
| [NirvanaManga](comics/nirvanamanga/index.js) | nirvanamanga.com | Turkish | Adult | 1.0.0 |
| [Olympus Scanlation](comics/olympusscans/index.js) | olympusbiblioteca.com | Spanish | Adult | 1.0.2 |
| [Rawkuma](comics/rawkuma/index.js) | rawkuma.net | Japanese | Adult | 1.0.1 |
| [ReManga](comics/remanga/index.js) | remanga.org | Russian | Adult | 1.2.1 |
| [Scan-VF](comics/scanvf/index.js) | scan-vf.net | French | Safe | 1.0.0 |
| [Serein Scan](comics/sereinscan/index.js) | sereinscan.net | Turkish | Safe | 1.0.0 |
| [Tapas](comics/tapas/index.js) | tapas.io | English | Mature | 1.2.0 |
| [Tilki Scans](comics/tilkiscans/index.js) | tilkiscans.com | Turkish | Mature | 1.1.0 |
| [ToonGod](comics/toongod/index.js) | toongod.org | English | Adult | 1.0.0 |
| [Toonily](comics/toonily/index.js) | toonily.com | English | Adult | 1.2.1 |
| [Tritinia Scans](comics/tritinia/index.js) | tritinia.org | English | Mature | 1.0.1 |
| [TruyenQQ](comics/truyenqq/index.js) | truyenqqgo.com | Vietnamese | Safe | 1.0.0 |
| [Turkmanga](comics/turkmanga/index.js) | turkmanga.org | Turkish | Adult | 1.0.0 |
| [VIZ Manga](comics/viz/index.js) | viz.com | English | Mature | 1.0.0 |
| [WaManga](comics/wamanga/index.js) | wamanga.ru | Russian | Adult | 1.2.0 |
| [WEBTOON](comics/webtoons/index.js) | webtoons.com | English | Safe | 1.0.0 |
| [Weeb Central](comics/weebcentral/index.js) | weebcentral.com | English | Adult | 1.0.0 |
| [Yurimanga](comics/yurimanga/index.js) | yurimanga.net | English | Adult | 1.1.0 |

### Novels

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [17K Novel Network](novels/17k/index.js) | 17k.com | Chinese | Mature | 1.3.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [Dreame](novels/dreame/index.js) | dreame.com | English | Adult | 1.2.0 |
| [FreeWebNovel](novels/freewebnovel/index.js) | freewebnovel.com | English | Adult | 1.2.0 |
| [GoodNovel](novels/goodnovel/index.js) | goodnovel.com | English | Adult | 1.2.1 |
| [JJWXC](novels/jjwxc/index.js) | jjwxc.net | Chinese | Mature | 1.3.0 |
| [LibRead](novels/libread/index.js) | libread.com | English | Adult | 1.2.0 |
| [MoboReader](novels/moboreader/index.js) | moboreader.com | English | Adult | 1.2.0 |
| [NovelBuddy](novels/novelbuddy/index.js) | novelbuddy.me | English | Adult | 1.2.0 |
| [NovelFire](novels/novelfire/index.js) | novelfire.net | English | Adult | 2.6.0 |
| [NovelFull](novels/novelfull/index.js) | novelfull.net | English | Adult | 1.1.0 |
| [Qidian](novels/qidian/index.js) | qidian.com | Chinese | Safe | 1.2.0 |
| [Ranobes](novels/ranobes/index.js) | ranobes.top | English | Adult | 1.1.1 |
| [ReadNovelFull](novels/readnovelfull/index.js) | readnovelfull.com | English | Adult | 1.1.1 |
| [ReadWN](novels/readwn/index.js) | wuxiabox.com | English | Safe | 1.2.1 |
| [Royal Road](novels/royalroad/index.js) | royalroad.com | English | Safe | 1.0.0 |
| [ScribbleHub](novels/scribblehub/index.js) | scribblehub.com | English | Adult | 1.0.0 |
| [Wattpad](novels/wattpad/index.js) | wattpad.com | English | Adult | 1.1.0 |
| [Webfic](novels/webfic/index.js) | webfic.com | English | Adult | 1.3.0 |
| [Webnovel](novels/webnovel/index.js) | webnovel.com | English | Adult | 1.2.0 |
| [Wuxiaworld](novels/wuxiaworld/index.js) | wuxiaworld.com | English | Mature | 1.1.0 |

### Anime

Anime extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [AniZone](anime/anizone/index.js) | anizone.to | English | Mature | 1.0.0 |
| [KickAssAnime](anime/kickassanime/index.js) | kaa.lt | English | Mature | 1.0.0 |
| [UniqueStream](anime/uniquestream/index.js) | anime.uniquestream.net | English | Mature | 1.0.1 |

## Known issues

These extensions are known to be broken right now:

- **Flame Scans** (`flamescans`): The site's domain now redirects to a Discord invite, and its image host is offline.
- **Komikindo** (`komikindo`): The site is down for maintenance.

## Credits

Thanks to the people who built extensions for Inkstone.

- [omfgitsjesus](https://discord.com/users/177424485526274048): HiperDEX

## Contributing

New extensions and fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Copyright and takedowns

Inkstone doesn't host any content. The extensions are code that runs on your device and reads from other sites. If you think something in this repository infringes your rights, open an issue with the "Copyright or takedown request" template, or message us on [Discord](https://discord.gg/6pX2XgFYcs). More at [inkstone.web.app/copyright](https://inkstone.web.app/copyright).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

Inkstone doesn't host any content. Extensions read from third party sites, and everything they show belongs to those sites and their owners.
