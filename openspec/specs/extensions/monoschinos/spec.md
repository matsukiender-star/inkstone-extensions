# extensions/monoschinos Specification

## Purpose
MonosChinos (monoschinos.st): Spanish-subtitled anime for Sumizuri; catalog of 4,000+ titles.

## Requirements

### Requirement: Listing
The extension SHALL be listed as `monoschinos`, for anime in Spanish, with the content rating `mature`, because it is a general anime catalog whose genres include Ecchi and Gore, and it has a "Sin Censura" category with uncensored TV versions of series. It carries no hentai: searching "hentai" only returns regular series with the word in their title.

#### Scenario: Catalog listing
- **WHEN** the extension appears in the catalog
- **THEN** it is marked Mature
- **AND** it declares the capabilities `browse`, `search`, `genres`, `details`, `chapters` and `videos`

### Requirement: Browse feeds
The extension SHALL provide the feeds Directory (`directory`) and Latest Episodes (`latest`), in that order, so Sumizuri shows the directory under Popular and the newest episodes under Latest.

#### Scenario: Open the Directory feed
- **WHEN** the user opens the `directory` feed
- **THEN** 24 titles with covers are listed
- **AND** scrolling loads the next page, which differs from the first

#### Scenario: Open the Latest Episodes feed
- **WHEN** the user opens the `latest` feed
- **THEN** the anime of the newest episodes are listed once each, under the anime's title

### Requirement: Latest Episodes has one page
The `latest` feed SHALL return a single page, because the site's home page does not paginate.

#### Scenario: Scroll the Latest Episodes feed
- **WHEN** the user reaches the end of the `latest` feed
- **THEN** no further page is requested

### Requirement: Search
The extension SHALL support text search, and SHALL return an empty list when nothing matches.

#### Scenario: Search for a title
- **WHEN** the user searches for "naruto"
- **THEN** matching titles are listed

#### Scenario: Search with no match
- **WHEN** the user searches for "pokémon", which the site does not carry
- **THEN** an empty list is returned without an error

### Requirement: Genres
The extension SHALL provide the site's 47 genres, read from its directory filters, and SHALL support narrowing the directory by a genre.

#### Scenario: Filter by a genre
- **WHEN** the user picks the genre Acción
- **THEN** the directory lists only titles in that genre

### Requirement: Details and episodes
The extension SHALL show a title's description, genres and status, and SHALL return its whole episode list, newest first, with no duplicates.

#### Scenario: Long series
- **GIVEN** the title One Piece
- **WHEN** its episodes are listed
- **THEN** all 1,180 episodes are returned, newest first

### Requirement: Episodes have no dates
Episodes SHALL carry no `time`, because the site does not publish a date for an episode.

#### Scenario: Episode list
- **WHEN** an episode list is shown
- **THEN** no episode has a release date

### Requirement: Playing an episode
The extension SHALL return one video per server it can read, from VOE, LuluStream, OK.ru, MixDrop, YourUpload and Mp4Upload, with HLS streams first, and SHALL throw an error naming how many servers were tried when none of them gives a video.

#### Scenario: Recent episode
- **GIVEN** the episode Ao Ashi season 2, episode 4
- **WHEN** the user plays it
- **THEN** VOE, LuluStream, MixDrop and Mp4Upload each give a video that answers 200

#### Scenario: Episode whose links are all dead
- **GIVEN** an episode whose uploads were removed from every server, such as One Piece Film: Red
- **WHEN** the user plays it
- **THEN** an error says that none of the servers gave a playable video

### Requirement: Unsupported servers
The extension SHALL skip Mega, Filemoon, SaveFiles, DoodStream, Uqload, Videobin, Sendvid, Google Drive and Listeamed, because their videos are encrypted in the browser, sit behind a challenge, or did not answer.

#### Scenario: Episode with only unsupported servers
- **GIVEN** an episode served only by unsupported servers
- **WHEN** the user plays it
- **THEN** an error says that none of the servers gave a playable video
