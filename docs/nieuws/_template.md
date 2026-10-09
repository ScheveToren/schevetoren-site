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

## FEN-diagram (Lichess analysebord)

```fen
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
orientation: white
caption: Optioneel onderschrift
```

Bewerk op https://lichess.org/editor en plak FEN of URL terug in beheer.

## Lichess-partij

```game
abcdefgh
```

Of plak een volledige Lichess-URL; CI maakt de officiële game-embed.

## PGN (eigen viewer met zetten-navigatie)

```pgn
orientation: white
caption: Clubpartij
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6
```

Bezoekers kunnen zetten doorlopen; “Analyseer op Lichess” opent de PGN daar.
