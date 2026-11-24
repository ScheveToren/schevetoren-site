---
title: "Titel van het bericht"
slug: unieke-slug
excerpt: "Korte samenvatting voor het overzicht."
date: 2026-09-20
author: "Bestuur"
draft: true
cover: media/unieke-slug/hero.jpg
pdf: media/unieke-slug/bijlage.pdf
---

Schrijf hier de inhoud in Markdown. Via beheer: toolbar (vet/cursief/…) en live voorbeeld.

## Afbeelding

Plaats bestanden in `docs/nieuws/berichten/media/<slug>/` (of upload via CMS) en verwijs relatief:

![Omschrijving](./media/unieke-slug/foto.jpg)

## Stelling / diagram (eigen bordviewer)

Gebruik altijd een `pgn`-blok met `[SetUp "1"]` en `[FEN "…"]`. Zo krijg je hetzelfde bord als bij clubanalyses (Chessground + knoppen + “Analyseer op Lichess”), ook zonder zetten.

```pgn
orientation: white
caption: Optioneel onderschrift
[Event "Stelling"]
[Site "?"]
[Date "????.??.??"]
[Round "-"]
[White "Wit"]
[Black "Zwart"]
[Result "*"]
[SetUp "1"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]

*
```

Optioneel: `analyse: false` verbergt de link “Analyseer op Lichess” (handig bij een prijsvraag).

Tip: open https://lichess.org/editor, zet de stelling klaar, kopieer de FEN. In beheer: plak FEN → **Invoegen als stelling**.

## PGN met zetten

Zelfde viewer; voeg zetten toe onder de headers (of plak een volledige PGN via beheer → **Invoegen als PGN**).

```pgn
orientation: white
caption: Clubpartij
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6
```

## Lichess-partij

Alleen voor een bestaande Lichess-partij (officiële game-embed):

```game
abcdefgh
```

Of plak een volledige Lichess-URL in beheer → **Invoegen als partij**.
