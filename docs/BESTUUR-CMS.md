# Bestuur: website beheer (CMS)

De clubsite blijft **statisch op GitHub Pages**. Als bestuur bewerk je content via **beheer** in de browser; publicatie gaat veilig via de API (Pi of Google Apps Script) naar GitHub (niet met je eigen GitHub-wachtwoord in de browser).

## Wie mag beheren?

- Inloggen met **Lichess** (zelfde als aanwezigheid).
- In het spreadsheet-tabblad **Players** moet jouw rij `is_admin` = `TRUE` hebben én je **Lichess-gebruikersnaam** kloppen.
- Zonder admin-rechten zie je geen beheerformulieren.

Open: [`beheer.html`](beheer.html) (ook bereikbaar via de footer-link **Beheer**).

## Eenmalig (IT / webbeheerder)

1. **Apps Script** (als je die nog gebruikt) — plak de nieuwste code uit [`scripts/google-apps-script-live.gs`](../scripts/google-apps-script-live.gs) in het gekoppelde spreadsheet-project.
2. **Script property / `.env` `GITHUB_PAT`** — token met **Contents: Read and write** op alleen de repo `ScheveToren/schevetoren-site`.
3. Bij Apps Script: **`authorizeExternalAccess`** één keer runnen en web app opnieuw deployen.
4. Test op beheer: **Test GitHub-verbinding**.

## Publiceren (dagelijks gebruik)

1. Ga naar **Website beheer** en log in met Lichess.
2. Kies een tab:
   - **Nieuws** — titel, datum, slug, Markdown (toolbar + voorbeeld) → **Publiceren naar GitHub**.
   - **Pagina’s** — kies contact / jeugd / gedragsregels, bewerk JSON → publiceren.
   - **Kalender ICS** — upload een `.ics`-bestand (vervangt `kalender/club-upload.ics` op de site).
3. Wacht **ongeveer 1–3 minuten**: GitHub Actions bouwt o.a. nieuws-HTML, pagina’s en sitemap opnieuw.
4. Vernieuw de live site (hard refresh) om wijzigingen te zien.

## Nieuws

- Berichten worden `.md`-bestanden onder `docs/nieuws/berichten/`.
- **Bestaand bericht bewerken:** dropdown **Bestaand bericht** → **Laden** → aanpassen → **Publiceren**.
- **Concept** (`draft`) verschijnt niet op de publieke nieuwspagina tot je draft uitzet en opnieuw publiceert.
- **Opmaak:** knoppen voor vet, cursief, kop, link, lijst; rechts zie je een live voorbeeld.
- **Afbeeldingen / cover:** upload via het mediablok (max. ca. 3 MB; jpeg/png/webp/gif). Cover komt boven het bericht; “Uploaden & invoegen” plaatst Markdown in de tekst. Bestanden landen in `media/<slug>/`.
- **PDF-bijlage (optioneel):** één PDF per bericht (max. ca. 8 MB). Op de site: ingesloten viewer + downloadknop (handig op telefoons).

### Schaak: FEN, partij, PGN

| Type | Hoe | Wat bezoekers zien |
|------|-----|--------------------|
| **FEN** | Knop **FEN**, of plak FEN/Lichess-URL in het schaakhulpblok → **Invoegen als FEN** | Interactief Lichess-analysebord |
| **Partij** | Plak een Lichess-partij-URL → **Invoegen als partij** | Officiële Lichess game-embed (zetten navigatie) |
| **PGN** | Plak PGN → **Invoegen als PGN** | Bord met vorige/volgende, zettenlijst, flip; link “Analyseer op Lichess” |

Tip: open de **Lichess-editor**, zet de stelling klaar, kopieer de FEN of URL terug naar beheer.

## Pagina’s (contact, jeugd, gedragsregels)

- Bron staat in `docs/content/pages/*.json`.
- Na publicatie genereert CI de HTML-pagina’s opnieuw. Bewerk **niet** handmatig de gegenereerde HTML als je CMS gebruikt.

## Kalender: ICS vs homepage-widget

| Onderdeel | Wat het doet |
|-----------|----------------|
| **ICS upload (CMS)** | Abonneer-link op kalender/home wijst naar de geüploade clubkalender (`club-upload.ics` na upload). |
| **Widget op de homepage** | Toont nog steeds data uit `season.json` + `calendar-events.json`. |

## Veiligheid

- Alleen admins met geldig Lichess-token kunnen CMS-acties aanroepen.
- De GitHub PAT leeft alleen in Apps Script Script Properties of de Pi `.env`.
- Elke publicatie is een **git commit** — historie blijft bewaard in GitHub.

## Gerelateerd

- Aanwezigheid en invite-codes: [`admin.html`](admin.html) en [`attendance.html`](attendance.html).
- Technische README: [README.md](../README.md) (OAuth, UrlFetch, CI).
