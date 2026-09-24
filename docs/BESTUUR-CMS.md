# Bestuur: website beheer (CMS)

De clubsite blijft **statisch op GitHub Pages**. Als bestuur bewerk je content via **beheer** in de browser; publicatie gaat veilig via Google Apps Script naar GitHub (niet met je eigen GitHub-wachtwoord in de browser).

## Wie mag beheren?

- Inloggen met **Lichess** (zelfde als aanwezigheid).
- In het spreadsheet-tabblad **Players** moet jouw rij `is_admin` = `TRUE` hebben én je **Lichess-gebruikersnaam** kloppen.
- Zonder admin-rechten zie je geen beheerformulieren.

Open: [`beheer.html`](beheer.html) (ook bereikbaar via de footer-link **Beheer**).

## Eenmalig (IT / webbeheerder)

1. **Apps Script** — plak de nieuwste code uit [`scripts/google-apps-script-live.gs`](../scripts/google-apps-script-live.gs) in het gekoppelde spreadsheet-project.
2. **Script property `GITHUB_PAT`** — Apps Script → **Project settings** → **Script properties**:
   - Naam: `GITHUB_PAT`
   - Waarde: een GitHub **Personal Access Token** met **Contents: Read and write** op alleen de repo `ScheveToren/schevetoren-site` (fine-grained PAT aanbevolen).
   - De PAT staat **nooit** in de website, `config.js` of in e-mail naar leden.
3. **`authorizeExternalAccess`** — in de script-editor één keer **Run** (▶) en alle machtigingen goedkeuren (Lichess + GitHub API).
4. **Web app opnieuw deployen** — Deploy → Manage deployments → nieuwe versie (Execute as: Me, Who has access: Anyone).

Test daarna op beheer: **Test GitHub-verbinding**. Dat schrijft een klein bestand `docs/content/.cms-health.json` in de repo.

## Publiceren (dagelijks gebruik)

1. Ga naar **Website beheer** en log in met Lichess.
2. Kies een tab:
   - **Nieuws** — titel, datum, slug, Markdown-tekst → **Publiceren naar GitHub**.
   - **Pagina’s** — kies contact / jeugd / gedragsregels, bewerk JSON → publiceren.
   - **Kalender ICS** — upload een `.ics`-bestand (vervangt `kalender/club-upload.ics` op de site).
3. Wacht **ongeveer 1–3 minuten**: GitHub Actions bouwt o.a. nieuws-HTML, pagina’s en sitemap opnieuw.
4. Vernieuw de live site (hard refresh) om wijzigingen te zien.

Bij een foutmelding: noteer de tekst op het scherm; vaak ontbreken admin-rechten, GitHub-token of is de webapp-deployment verouderd.

## Nieuws

- Berichten worden `.md`-bestanden onder `docs/nieuws/berichten/`.
- **Concept** (`draft`) verschijnt niet op de publieke nieuwspagina tot je draft uitzet en opnieuw publiceert.
- Diagrammen: Markdown-blokken ` ```fen ` (zoals in het bestaande nieuws).
- Afbeeldingen: nog niet via CMS uploaden — voeg ze toe via GitHub of vraag IT.

## Pagina’s (contact, jeugd, gedragsregels)

- Bron staat in `docs/content/pages/*.json`.
- Na publicatie genereert CI de HTML-pagina’s opnieuw. Bewerk **niet** handmatig de gegenereerde HTML als je CMS gebruikt (wijzigingen worden overschreven).

## Kalender: ICS vs homepage-widget

| Onderdeel | Wat het doet |
|-----------|----------------|
| **ICS upload (CMS)** | Abonneer-link op kalender/home wijst naar de geüploade clubkalender (`club-upload.ics` na upload). |
| **Widget op de homepage** | Toont nog steeds data uit `season.json` + `calendar-events.json` (clubavonden / interne planning). Externe wedstrijden uit alleen ICS zie je vooral via **abonneren** in je agenda-app, niet per se in de widget. |

Wil je later ook de widget vanuit ICS vullen, dan is dat een aparte CI-stap (niet nodig voor abonneren).

## Veiligheid

- Alleen admins met geldig Lichess-token kunnen CMS-acties aanroepen.
- De GitHub PAT leeft alleen in Apps Script Script Properties.
- Elke publicatie is een **git commit** — historie blijft bewaard in GitHub.

## Gerelateerd

- Aanwezigheid en invite-codes: [`admin.html`](admin.html) en [`attendance.html`](attendance.html).
- Technische README: [README.md](../README.md) (OAuth, UrlFetch, CI).
