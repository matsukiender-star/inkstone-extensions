> [!NOTE]
> **Este es el fork de Matsuki Ender** del repositorio original [realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions). Aquí preparo extensiones nuevas y arreglos antes de mandarlos como PR.
>
> Para probar en Sumizuri las extensiones que todavía no se fusionan, hay dos repos de prueba:
> - **Todas:** `https://raw.githubusercontent.com/matsukiender-star/inkstone-extensions/suki/versioning.json`
> - **Solo español** (más MangaDex, Kagane, UniqueStream y Wattpad, que también traen contenido en español): `https://raw.githubusercontent.com/matsukiender-star/inkstone-extensions/suki-es/versioning.json`

# Inkstone

**Registro de extensiones.** Extensiones hechas por la comunidad que agregan contenido a Boundless Reader y Sumizuri. Gratis y de código abierto con licencia MIT.

Cada extensión es un archivo pequeño de JavaScript que tu app descarga y ejecuta en tu dispositivo (en un sandbox, en Boundless Reader).

El catálogo completo y la documentación están en [inkstone.web.app](https://inkstone.web.app). ¿Tienes dudas o una extensión dejó de funcionar? Pásate a saludar al [Discord](https://discord.gg/6pX2XgFYcs).

## Agrégalo a tu app

<p align="center">
  <a href="https://inkstone.web.app/boundless"><img src="docs/assets/add-to-boundless.svg" alt="Add to Boundless" height="56"></a>
  &nbsp;
  <a href="https://inkstone.web.app/sumizuri"><img src="docs/assets/add-to-sumizuri.svg" alt="Add to Sumizuri" height="56"></a>
</p>

Toca un botón desde el dispositivo que tiene la app. Se abre la app y te pide que confirmes. También puedes pegar esto en los ajustes de extensiones de Boundless Reader, o en Sumizuri (Explorar, luego Repos, luego Agregar un repo):

```
https://inkstone.web.app
```

Guía paso a paso: [inkstone.web.app/installation](https://inkstone.web.app/installation)

No se instala nada hasta que eliges una extensión, y quitar una es cuestión de un toque.

## Qué hay aquí

```
comics/<id>/index.js       extensiones de manga, manhwa y webtoons
novels/<id>/index.js       extensiones de novelas
mixed/<id>/index.js        extensiones que tienen las dos cosas
anime/<id>/index.js        extensiones de anime, para apps que reproducen video como Sumizuri
versioning.json            la lista que lee tu app
docs/assets/               los botones de Agregar a Boundless y Agregar a Sumizuri
docs/BUILD_WITH_AI.md      cómo pedirle a un asistente de IA que te haga una
docs/EXTENSIONS.md         cómo funciona una extensión
docs/TESTING.md            cómo comprobar que una extensión funciona
docs/test-extension.mjs    el script de pruebas
docs/OPENSPEC.md           el método guiado por especificaciones, con OpenSpec
openspec/                  especificaciones que describen cómo funcionan las extensiones
AGENTS.md                  instrucciones para asistentes de programación con IA
```

## Haz una con IA

Abre este repo en Claude Code, Cursor, Codex o cualquier asistente de programación y dile qué sitio quieres. Va a leer [AGENTS.md](AGENTS.md) y seguir [docs/BUILD_WITH_AI.md](docs/BUILD_WITH_AI.md). También puedes pegar esa guía en un chat.

¿Prefieres revisar un plan por escrito antes de que se escriba código? Este repo funciona con [OpenSpec](https://github.com/Fission-AI/OpenSpec). Corre `openspec init` y luego propón un cambio para tu sitio. Consulta [docs/OPENSPEC.md](docs/OPENSPEC.md).

## Extensiones

Por ahora hay 197 extensiones. Las clasificaciones son Para todos, Maduro o Adultos, y algunas extensiones además clasifican cada título por separado.

Cada extensión vive en la carpeta de lo que ofrece: `comics`, `novels`, `mixed` para las que tienen las dos cosas, o `anime`. El sitio sigue sirviendo cada una en `inkstone.web.app/<id>/index.js`, así que las carpetas no cambian nada en las apps.

### Cómics

| Extensión | Sitio | Idioma | Clasificación | Versión |
| --- | --- | --- | --- | --- |
| [Akaza Scans](comics/akazascans/index.js) | akazascans.org | Inglés | Para todos | 1.0.0 |
| [Anikiga](comics/anikiga/index.js) | anikiga.com | Turco | Para todos | 1.0.0 |
| [Anime-Sama](comics/animesama/index.js) | anime-sama.to | Francés | Maduro | 1.0.1 |
| [AnimeShinigami](comics/animeshinigami/index.js) | animeshinigami.com | Italiano | Para todos | 1.0.0 |
| [Anisa Scans](comics/anisascans/index.js) | anisascans.in | Inglés | Para todos | 1.0.0 |
| [Arena Scans](comics/arenascans/index.js) | arenascan.com | Inglés | Maduro | 1.0.0 |
| [Aster Scans](comics/asterscans/index.js) | asterscans.com | Inglés | Para todos | 1.0.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | Inglés | Para todos | 2.4.0 |
| [Athrea Scans](comics/athreascans/index.js) | athreascans.com | Inglés | Adultos | 1.0.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | Inglés | Maduro | 1.0.1 |
| [BL village](comics/blvillage/index.js) | blvillage.com | Japonés | Adultos | 1.1.1 |
| [Blue Solo](comics/bluesolo/index.js) | bluesolo.org | Francés | Para todos | 1.0.0 |
| [Bun Manga](comics/bunmanga/index.js) | bunmanga.com | Inglés | Para todos | 1.0.0 |
| [Café com Yaoi](comics/cafcomyaoi/index.js) | cafecomyaoi.com.br | Portugués de Brasil | Maduro | 1.0.0 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | Inglés | Adultos | 4.4.0 |
| [CManga](comics/cmanga/index.js) | cmangavn.com | Vietnamita | Adultos | 1.0.0 |
| [Cocomic](comics/cocomic/index.js) | cocomic.co | Inglés | Para todos | 1.0.0 |
| [ComicFury](comics/comicfury/index.js) | comicfury.com | Inglés | Adultos | 1.0.0 |
| [ComicLand](comics/comicland/index.js) | comicland.org | Inglés | Adultos | 1.0.0 |
| [Decadence Scans](comics/decadencescans/index.js) | reader.decadencescans.com | Inglés | Para todos | 1.0.0 |
| [Dynasty Scans](comics/dynastyscans/index.js) | dynasty-scans.com | Inglés | Maduro | 1.0.0 |
| [Eva Scans](comics/evascans/index.js) | evascans.net | Inglés | Para todos | 1.0.0 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | Inglés | Para todos | 1.0.1 |
| [Flame Scans](comics/flamescans/index.js) | flamecomics.xyz | Inglés | Para todos | 1.0.0 |
| [Flash-Manga](comics/flashmanga/index.js) | flash-manga.net | Tailandés | Para todos | 1.0.0 |
| [FMTEAM](comics/fmteam/index.js) | fmteam.fr | Francés | Para todos | 1.0.0 |
| [GakaMangas](comics/gakamangas/index.js) | gakamangas.com | Inglés | Para todos | 1.0.0 |
| [GD Scans](comics/gdscans/index.js) | gdscans.com | Inglés | Adultos | 1.0.0 |
| [GhosToon](comics/ghostoon/index.js) | ghostoon.com | Turco | Para todos | 1.0.0 |
| [GlobalComix](comics/globalcomix/index.js) | globalcomix.com | Inglés | Adultos | 1.1.1 |
| [Grabber Zone](comics/grabberzone/index.js) | grabber.zone | Inglés | Para todos | 1.0.0 |
| [GTO The Great Site](comics/gtothegreatsite/index.js) | reader.gtothegreatsite.net | Italiano | Maduro | 1.0.0 |
| [Hades no Fansub](comics/hadesnofansub/index.js) | lectorhades.latamtoon.com | Español | Para todos | 1.0.0 |
| [Hijala Scans](comics/hijala/index.js) | en-hijala.com | Inglés | Para todos | 1.0.0 |
| [HiperDEX](comics/hiperdex/index.js) | hiperdex.tv | Inglés | Adultos | 1.0.1 |
| [HiveToons](comics/hivetoon/index.js) | hivetoons.org | Inglés | Adultos | 1.1.0 |
| [Hot Cabaret Scan](comics/hotcabaretscan/index.js) | hotcabaretscan.com | Portugués de Brasil | Maduro | 1.0.0 |
| [Hunlight Comics](comics/hunlightcomics/index.js) | hunlightcomics.com | Inglés | Para todos | 1.0.0 |
| [Indomanhwa](comics/indomanhwa/index.js) | indomanhwa.com | Indonesio | Maduro | 1.0.0 |
| [InkStory](comics/inkstory/index.js) | inkstory.net | Ruso | Maduro | 1.1.0 |
| [InManga](comics/inmanga/index.js) | inmanga.com | Español | Para todos | 1.1.0 |
| [Inu Manga](comics/inumanga/index.js) | inu-manga.net | Tailandés | Maduro | 1.0.0 |
| [Inventario Oculto](comics/inventariooculto/index.js) | inventariooculto.com | Español | Para todos | 1.0.0 |
| [Kagane](comics/kagane/index.js) | kagane.org | Inglés | Para todos | 1.3.2 |
| [Kami Sama Explorer](comics/kamisamaexplorer/index.js) | leitor.kamisama.com.br | Portugués de Brasil | Para todos | 1.0.0 |
| [Kazoku Den](comics/kazokuden/index.js) | kazokuden.com | Español | Maduro | 1.0.0 |
| [Keikomik](comics/keikomik/index.js) | keikomik.net | Indonesio | Adultos | 1.0.0 |
| [Ken Scans](comics/kenscans/index.js) | kencomics.com | Inglés | Maduro | 1.0.0 |
| [Kingofshojo](comics/kingofshojo/index.js) | kingofshojo.com | Inglés | Adultos | 1.0.0 |
| [KlikManga](comics/klikmanga/index.js) | klikmanga.org | Indonesio | Para todos | 1.0.0 |
| [KokoMangas](comics/kokomangas/index.js) | kokomangas.com | Inglés | Adultos | 1.0.0 |
| [Komikindo](comics/komikindo/index.js) | komikindo.ch | Indonesio | Adultos | 1.0.1 |
| [Komiku](comics/komiku/index.js) | komiku.org | Indonesio | Adultos | 1.0.0 |
| [Koreli Scans](comics/koreliscans/index.js) | nabicix.com | Turco | Para todos | 1.0.0 |
| [KSGroupScans](comics/ksgroupscans/index.js) | ksgroupscans.com | Inglés | Maduro | 1.0.0 |
| [KunManga](comics/kunmanga/index.js) | kunmanga.com | Inglés | Adultos | 1.1.0 |
| [Lagoon Scans](comics/lagoonscans/index.js) | lagoonscans.com | Inglés | Para todos | 1.0.0 |
| [Lectormanga](comics/lectormanga/index.js) | lectormangass.net | Español | Adultos | 1.2.1 |
| [LelManga](comics/lelmanga/index.js) | lelmanga.com | Francés | Adultos | 1.0.0 |
| [Lelscans](comics/lelscans/index.js) | lelscans.net | Francés | Para todos | 1.1.0 |
| [LHTranslation](comics/lhtranslation/index.js) | lhtranslation.net | Inglés | Maduro | 1.0.0 |
| [LupiTeam](comics/lupiteam/index.js) | lupiteam.net | Italiano | Para todos | 1.0.0 |
| [Madara Scans](comics/madarascans/index.js) | madarascans.net | Inglés | Maduro | 1.0.0 |
| [Magus Manga](comics/magusmanga/index.js) | magustoon.org | Inglés | Para todos | 1.0.0 |
| [Manga Demon](comics/mangademon/index.js) | demonicscans.org | Inglés | Maduro | 1.0.0 |
| [Manga District](comics/mangadistrict/index.js) | mangadistrict.com | Inglés | Adultos | 1.0.0 |
| [Manga Eclipse](comics/mangaeclipse/index.js) | mangaeclipse.com | Inglés | Maduro | 1.0.0 |
| [Manga Trend](comics/mangatrend/index.js) | mangatrend.org | Inglés | Para todos | 1.0.0 |
| [Manga-Corporation](comics/mangacorporation/index.js) | manga-corporation.com | Francés | Para todos | 1.0.0 |
| [Manga-Scantrad](comics/mangascantrad/index.js) | manga-scantrad.io | Francés | Adultos | 1.0.0 |
| [Mangabat](comics/mangabats/index.js) | mangabats.com | Inglés | Adultos | 1.0.0 |
| [MangaBuddy](comics/mangabuddy/index.js) | mangabuddy1.co.uk | Inglés | Adultos | 1.3.0 |
| [MangaDex](comics/mangadex/index.js) | mangadex.org | Inglés | Para todos | 1.2.0 |
| [MangaFire](comics/mangafire/index.js) | mangafire.to | Inglés | Para todos | 1.4.1 |
| [MangaFox](comics/mangafox/index.js) | fanfox.net | Inglés | Adultos | 1.0.0 |
| [MangaFreak](comics/mangafreak/index.js) | mangafreak.me | Inglés | Adultos | 1.0.1 |
| [MangaGo](comics/mangago/index.js) | mangago.me | Inglés | Adultos | 1.1.0 |
| [MangaHere](comics/mangahere/index.js) | mangahere.cc | Inglés | Adultos | 1.1.1 |
| [MangaHub](comics/mangahub/index.js) | mangahub.io | Inglés | Adultos | 1.0.0 |
| [MangaK](comics/mangak/index.js) | mangak.io | Inglés | Maduro | 1.0.0 |
| [Mangakakalot](comics/mangakakalot/index.js) | mangakakalot.gg | Inglés | Adultos | 1.2.0 |
| [MangaKatana](comics/mangakatana/index.js) | mangakatana.com | Inglés | Adultos | 1.1.3 |
| [MangaOwl](comics/mangaowl/index.js) | mangaowl.io | Inglés | Adultos | 1.0.0 |
| [Mangapill](comics/mangapill/index.js) | mangapill.com | Inglés | Adultos | 1.0.0 |
| [MangaPlaza](comics/mangaplaza/index.js) | mangaplaza.com | Inglés | Adultos | 1.1.1 |
| [MangaRead](comics/mangaread/index.js) | mangaread.org | Inglés | Adultos | 1.0.1 |
| [Mangasushi](comics/mangasushi/index.js) | mangasushi.org | Inglés | Para todos | 1.0.0 |
| [MangaToon](comics/mangatoon/index.js) | mangatoon.mobi | Inglés | Maduro | 1.2.0 |
| [MangaTown](comics/mangatown/index.js) | mangatown.com | Inglés | Adultos | 1.2.0 |
| [MangaWOW](comics/mangawow/index.js) | mangawow.org | Turco | Maduro | 1.0.0 |
| [Manhua Plus (.com)](comics/manhuapluscom/index.js) | manhuaplus.com | Inglés | Maduro | 1.0.0 |
| [ManhuaFast](comics/manhuafast/index.js) | manhuafast.net | Inglés | Maduro | 1.0.0 |
| [Manhuagui](comics/manhuagui/index.js) | m.manhuagui.com | Chino | Adultos | 1.0.1 |
| [ManhuaHot](comics/manhuahot/index.js) | manhuahot.com | Inglés | Maduro | 1.0.0 |
| [Manhuanext](comics/manhuanext/index.js) | manhuanext.com | Inglés | Para todos | 1.0.0 |
| [Manhuaplus](comics/manhuaplus/index.js) | manhuaplus.org | Inglés | Para todos | 1.0.0 |
| [Manhuaus](comics/manhuaus/index.js) | manhuaus.club | Inglés | Maduro | 1.0.0 |
| [ManhuaVN](comics/manhuavn/index.js) | manhuavn.top | Vietnamita | Adultos | 1.2.0 |
| [Manhwa Reads](comics/manhwareads/index.js) | manhwareads.com | Inglés | Maduro | 1.0.0 |
| [Manhwa18](comics/manhwa18/index.js) | manhwa18.cc | Inglés | Adultos | 1.0.0 |
| [ManhwaBuddy](comics/manhwabuddy/index.js) | manhwabuddy.com | Inglés | Adultos | 1.0.0 |
| [ManhwaClan](comics/manhwaclan/index.js) | manhwaclan.com | Inglés | Adultos | 1.0.0 |
| [Manhwaddict](comics/manhwaddict/index.js) | manhwaddict.com | Inglés | Adultos | 1.0.0 |
| [ManhwaGalaxy](comics/manhwagalaxy/index.js) | manhwagalaxy.com | Inglés | Adultos | 1.0.0 |
| [ManhwaHQ](comics/manhwahq/index.js) | manhwahq.com | Inglés | Adultos | 1.0.1 |
| [ManhwaNex](comics/manhwanex/index.js) | manhwanex.com | Inglés | Para todos | 1.0.0 |
| [ManhwaOnline](comics/manhwaonline/index.js) | manhwaonline.org | Inglés | Maduro | 1.0.0 |
| [ManhwaTop](comics/manhwatop/index.js) | manhwatop.com | Inglés | Adultos | 1.0.0 |
| [MGeko](comics/mgeko/index.js) | mgeko.cc | Inglés | Para todos | 1.0.0 |
| [Mgread.io](comics/mangayy/index.js) | mgread.io | Inglés | Maduro | 2.0.0 |
| [MHScans](comics/mhscans/index.js) | mhscans.com | Español | Para todos | 1.0.0 |
| [Monopoly Scan](comics/monopolyscan/index.js) | monopolymanhua.com | Español | Para todos | 1.0.0 |
| [Natomanga](comics/natomanga/index.js) | natomanga.com | Inglés | Adultos | 1.2.0 |
| [Naver Webtoon](comics/navercomic/index.js) | comic.naver.com | Coreano | Maduro | 1.2.0 |
| [Nebulosa Scan](comics/nebulosascan/index.js) | nebulosascan.com | Portugués de Brasil | Maduro | 1.0.0 |
| [NetTruyen](comics/nettruyen/index.js) | nettruyenvia.com | Vietnamita | Adultos | 1.0.0 |
| [Ngomik](comics/ngomik/index.js) | 02.ngomik.cc | Indonesio | Para todos | 1.0.0 |
| [NirvanaManga](comics/nirvanamanga/index.js) | nirvanamanga.com | Turco | Adultos | 1.0.0 |
| [Nyx Scans](comics/nyxscans/index.js) | nyxscans.com | Inglés | Para todos | 1.0.0 |
| [Olympus Scanlation](comics/olympusscans/index.js) | olympusbiblioteca.com | Español | Adultos | 1.0.2 |
| [Orion Scans](comics/orionscans/index.js) | orion-scans.com | Inglés | Para todos | 1.0.0 |
| [Phoenix Scans](comics/phoenixscans/index.js) | phoenixscans.com | Italiano | Maduro | 1.0.0 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | Inglés | Para todos | 1.1.1 |
| [Rackus](comics/rackus/index.js) | rackusreads.com | Inglés | Para todos | 1.0.0 |
| [Ragnarok Scanlation](comics/ragnarokscanlation/index.js) | ragnarokscanlation.org | Español | Para todos | 1.0.0 |
| [Rakuen Translations](comics/rakuentranslations/index.js) | rakuentranslations.com | Español | Maduro | 1.0.0 |
| [Raven Scans](comics/ravenscans/index.js) | ravenscans.org | Inglés | Adultos | 1.0.0 |
| [Rawkuma](comics/rawkuma/index.js) | rawkuma.net | Japonés | Adultos | 1.0.1 |
| [ReManga](comics/remanga/index.js) | remanga.org | Ruso | Adultos | 1.2.1 |
| [Renascans](comics/renascans/index.js) | renascans.net | Inglés | Para todos | 1.0.0 |
| [RokariComics](comics/rokaricomics/index.js) | rokaricomics.com | Inglés | Para todos | 1.0.0 |
| [Rolia Scan](comics/roliascan/index.js) | roliascan.com | Inglés | Maduro | 1.0.0 |
| [Rüya Manga](comics/ryamanga/index.js) | ruyamanga2.com | Turco | Para todos | 1.0.0 |
| [S2Manga](comics/s2manga/index.js) | s2read.com | Inglés | Para todos | 1.0.0 |
| [SamuraiScan](comics/samuraiscan/index.js) | samurai.j5z.xyz | Español | Para todos | 1.0.0 |
| [Sana Scans](comics/sanascans/index.js) | sanascans.com | Inglés | Para todos | 1.0.0 |
| [Scan-VF](comics/scanvf/index.js) | scan-vf.net | Francés | Para todos | 1.0.0 |
| [Scythe Scans](comics/scythescans/index.js) | scythescans.com | Inglés | Para todos | 1.0.0 |
| [Serein Scan](comics/sereinscan/index.js) | sereinscan.net | Turco | Para todos | 1.0.0 |
| [Tapas](comics/tapas/index.js) | tapas.io | Inglés | Maduro | 1.2.0 |
| [Tarot Scans](comics/tarotscans/index.js) | tarotscans.com | Turco | Para todos | 1.0.0 |
| [TCB Scans](comics/tcbscans/index.js) | tcbonepiecechapters.com | Inglés | Para todos | 1.0.0 |
| [Thunder Scans](comics/thunderscans/index.js) | en-thunderscans.com | Inglés | Maduro | 1.0.0 |
| [Tilki Scans](comics/tilkiscans/index.js) | tilkiscans.com | Turco | Maduro | 1.1.0 |
| [ToonGod](comics/toongod/index.js) | toongod.org | Inglés | Adultos | 1.0.0 |
| [ToonGrab](comics/toongrab/index.js) | toongrab.com | Inglés | Para todos | 1.0.0 |
| [Toonily](comics/toonily/index.js) | toonily.com | Inglés | Adultos | 1.2.1 |
| [Toonizy](comics/toonizy/index.js) | toonizy.com | Inglés | Para todos | 1.0.0 |
| [Tortuga Ceviri](comics/tortugaceviri/index.js) | tortugaceviri.com | Turco | Para todos | 1.0.0 |
| [Tritinia Scans](comics/tritinia/index.js) | tritinia.org | Inglés | Maduro | 1.0.1 |
| [TruyenQQ](comics/truyenqq/index.js) | truyenqqgo.com | Vietnamita | Para todos | 1.0.0 |
| [TruyenTini](comics/truyentini/index.js) | truyentini.net | Vietnamita | Para todos | 1.0.0 |
| [TruyenTuoiTho](comics/truyentuoitho/index.js) | truyentuoitho.com | Vietnamita | Para todos | 1.0.0 |
| [Tsundoku Traduções](comics/tsundokutradues/index.js) | tsundoku.com.br | Portugués de Brasil | Para todos | 1.0.0 |
| [Türkçe Manga Oku](comics/trkemangaoku/index.js) | trmangaoku.com | Turco | Para todos | 1.0.0 |
| [Turkmanga](comics/turkmanga/index.js) | turkmanga.org | Turco | Adultos | 1.0.0 |
| [TuttoAnimeManga](comics/tuttoanimemanga/index.js) | tuttoanimemanga.net | Italiano | Maduro | 1.0.0 |
| [Uchuujin Projects](comics/uchuujinprojects/index.js) | uchuujinmangas.com | Español | Maduro | 1.0.0 |
| [UnderTranslations](comics/undertranslations/index.js) | undertranslations.com | Español | Maduro | 1.0.0 |
| [Violet Scans](comics/violetscans/index.js) | violetmanga.com | Inglés | Para todos | 1.0.0 |
| [VIZ Manga](comics/viz/index.js) | viz.com | Inglés | Maduro | 1.0.0 |
| [Vortex Scans](comics/vortexscans/index.js) | vortexscans.org | Inglés | Para todos | 1.0.0 |
| [WaManga](comics/wamanga/index.js) | wamanga.ru | Ruso | Adultos | 1.2.0 |
| [WEBTOON](comics/webtoons/index.js) | webtoons.com | Inglés | Para todos | 1.0.0 |
| [Weeb Central](comics/weebcentral/index.js) | weebcentral.com | Inglés | Adultos | 1.0.0 |
| [YakshaComics](comics/yakshacomics/index.js) | yakshacomics.com | Inglés | Para todos | 1.0.0 |
| [Yuri-Online](comics/yurionline/index.js) | yuri-online.com | Español | Para todos | 1.0.0 |
| [Yurimanga](comics/yurimanga/index.js) | yurimanga.net | Inglés | Adultos | 1.1.0 |
| [Zinmanga](comics/zinmanga/index.js) | zinmanga.net | Inglés | Para todos | 1.0.0 |
| [مانجا ليك](comics/mangalik/index.js) | mangalik.net | Árabe | Para todos | 1.0.0 |

### Novelas

| Extensión | Sitio | Idioma | Clasificación | Versión |
| --- | --- | --- | --- | --- |
| [17K Novel Network](novels/17k/index.js) | 17k.com | Chino | Maduro | 1.3.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | Inglés | Para todos | 2.4.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | Inglés | Maduro | 1.0.1 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | Inglés | Adultos | 4.4.0 |
| [Dreame](novels/dreame/index.js) | dreame.com | Inglés | Adultos | 1.2.0 |
| [Exnovels](novels/exnovels/index.js) | exnovels.com | Inglés | Para todos | 1.0.1 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | Inglés | Para todos | 1.0.1 |
| [FreeWebNovel](novels/freewebnovel/index.js) | freewebnovel.com | Inglés | Adultos | 1.2.2 |
| [GoodNovel](novels/goodnovel/index.js) | goodnovel.com | Inglés | Adultos | 1.2.1 |
| [JJWXC](novels/jjwxc/index.js) | jjwxc.net | Chino | Maduro | 1.3.0 |
| [LibRead](novels/libread/index.js) | libread.com | Inglés | Adultos | 1.2.0 |
| [MoboReader](novels/moboreader/index.js) | moboreader.com | Inglés | Adultos | 1.2.0 |
| [Novel Archive](novels/novelarchive/index.js) | novelarchive.cc | Inglés | Maduro | 1.0.1 |
| [NovelBuddy](novels/novelbuddy/index.js) | novelbuddy.me | Inglés | Adultos | 1.2.0 |
| [NovelFire](novels/novelfire/index.js) | novelfire.net | Inglés | Adultos | 2.6.0 |
| [NovelFull](novels/novelfull/index.js) | novelfull.net | Inglés | Adultos | 1.1.0 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | Inglés | Para todos | 1.1.1 |
| [Qidian](novels/qidian/index.js) | qidian.com | Chino | Para todos | 1.2.0 |
| [Ranobes](novels/ranobes/index.js) | ranobes.top | Inglés | Adultos | 1.1.1 |
| [ReadNovelFull](novels/readnovelfull/index.js) | readnovelfull.com | Inglés | Adultos | 1.1.1 |
| [ReadWN](novels/readwn/index.js) | wuxiabox.com | Inglés | Para todos | 1.2.1 |
| [Royal Road](novels/royalroad/index.js) | royalroad.com | Inglés | Para todos | 1.0.0 |
| [ScribbleHub](novels/scribblehub/index.js) | scribblehub.com | Inglés | Adultos | 1.0.0 |
| [Sleepy Translations](novels/sleepytranslations/index.js) | sleepytranslations.com | Inglés | Para todos | 1.0.0 |
| [Wattpad](novels/wattpad/index.js) | wattpad.com | Inglés | Adultos | 1.1.1 |
| [Webfic](novels/webfic/index.js) | webfic.com | Inglés | Adultos | 1.3.0 |
| [Webnovel](novels/webnovel/index.js) | webnovel.com | Inglés | Adultos | 1.2.0 |
| [Wuxiaworld](novels/wuxiaworld/index.js) | wuxiaworld.com | Inglés | Maduro | 1.1.0 |
| [WuxiaWorld.site](novels/wuxiaworldsite/index.js) | wuxiaworld.site | Inglés | Para todos | 1.0.0 |

### Anime

Las extensiones de anime usan `medium: "anime"` y un método `getVideos`. Sumizuri las reproduce; Boundless por ahora se las salta.

| Extensión | Sitio | Idioma | Clasificación | Versión |
| --- | --- | --- | --- | --- |
| [AniZone](anime/anizone/index.js) | anizone.to | Inglés | Maduro | 1.0.0 |
| [KickAssAnime](anime/kickassanime/index.js) | kaa.lt | Inglés | Maduro | 1.0.1 |
| [UniqueStream](anime/uniquestream/index.js) | anime.uniquestream.net | Inglés | Maduro | 1.0.1 |

## Problemas conocidos

Se sabe que estas extensiones no funcionan por ahora:

- **Anisa Scans** (`anisascans`): el dominio del sitio ya no apunta a ningún servidor.
- **Renascans** (`renascans`): la dirección de la API del sitio (api.renascans.net) ya no existe.

## Créditos

Gracias a quienes han hecho extensiones para Inkstone.

- [omfgitsjesus](https://discord.com/users/177424485526274048): HiperDEX

## Cómo contribuir

Las extensiones nuevas y los arreglos son bienvenidos. Consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Derechos de autor y solicitudes de retiro

Inkstone no aloja ningún contenido. Las extensiones son código que se ejecuta en tu dispositivo y lee de otros sitios. Si crees que algo en este repositorio infringe tus derechos, abre un issue con la plantilla "Copyright or takedown request", o escríbenos por [Discord](https://discord.gg/6pX2XgFYcs). Más información en [inkstone.web.app/copyright](https://inkstone.web.app/copyright).

## Licencia

MIT. Consulta [LICENSE](LICENSE).

## Aviso

Inkstone es un proyecto independiente. No forma parte de Boundless Reader ni cuenta con su respaldo.

Inkstone no aloja ningún contenido. Las extensiones leen de sitios de terceros, y todo lo que muestran pertenece a esos sitios y a sus dueños.
